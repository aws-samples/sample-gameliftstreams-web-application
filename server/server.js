
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @fileoverview Main server application for GameLift Stream Web Sharing Demo
 * @description Handles WebRTC streaming, session management, and API endpoints
 * @requires express
 * @requires aws-sdk
 * @requires @aws-sdk/client-bedrock-runtime
 */

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const serverless = require('serverless-http');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { GameLiftStreams } = require('@aws-sdk/client-gameliftstreams');
const config = require('./config');

// Initialize GameLiftStreams client
const gameliftstreams = new GameLiftStreams({
  endpoint: config.GAMELIFT_STREAMS_ENDPOINT || null,
  region: config.GAMELIFT_STREAMS_REGION || null
});

/**
 * Token Security Configuration
 * Generates a unique connection identifier using cryptographically secure random values
 * @constant {string} connectionId
 * @description Used for tracking unique client connections and ensuring secure session management
 */
const connectionId = crypto.randomUUID();

/**
 * AWS SDK Configuration
 * Configures the global AWS SDK settings for all AWS service clients
 * 
 * @description Sets up AWS SDK with the following configurations:
 * - Regional endpoint configuration
 * - Retry handling for failed API calls
 * - Network timeout settings
 * 
 * @param {Object} config Configuration object for AWS SDK
 * @property {string} region - AWS region for service endpoints (us-west-2)
 * @property {number} maxRetries - Maximum number of retry attempts for failed API calls
 * @property {Object} retryDelayOptions - Configuration for exponential backoff
 * @property {number} retryDelayOptions.base - Base delay in milliseconds between retries
 * @property {Object} httpOptions - Network request configuration
 * @property {number} httpOptions.timeout - Request timeout in milliseconds
 * @property {number} httpOptions.connectTimeout - Connection establishment timeout
 * 
 * @example
 * // The configuration will result in:
 * // - 3 retry attempts with 100ms base delay
 * // - 5 second request timeout
 * // - 3 second connection timeout
 */
/**
 * Leave this here
 * @constant {boolean} IS_LOCAL - Determines if server is running in local development mode
 */
const IS_LOCAL = true;

/**
 * Declare server variables
 * @constant {http.Server} httpsServer - HTTPS server instance
 * @constant {http.Server} httpServer - HTTP server instance
 * @constant {http.Server} server - Server instance
 */
let httpsServer;
let httpServer;
let server;

/**
 * AWS Configuration
  * @constant {Object} awsConfig - AWS SDK configuration
 */

// Load shared AWS CLI config file, enable command-line overrides for region and profile
process.env.AWS_SDK_LOAD_CONFIG = '1';
if (IS_LOCAL) {
  applyCommandLineEnvOverride('--region', 'AWS_REGION');
  applyCommandLineEnvOverride('--profile', 'AWS_PROFILE');
}

/**
 * Express Application Setup
 * @description Initializes Express app with proxy trust and request size limits
 */
const app = express();
app.set('trust proxy', 1);

// Configure request body size limits
// Increase the limit to 100MB (adjust as needed)
app.use(express.json({ limit: config.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ limit: config.JSON_BODY_LIMIT, extended: true }));

/**
 * Middleware to track request correlation IDs and timing
 * @middleware
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Express.NextFunction} next - Express next middleware function
 */
app.use((req, res, next) => {
  req.correlationId = crypto.randomUUID();
  const startTime = Date.now();
  
  res.on('finish', () => {
    logger.info('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - startTime
    });
  });
  
  next();
});

// Create a timeout middleware factory
const timeoutMiddleware = (timeoutMs) => {
  return (req, res, next) => {
    // Skip timeout for streaming endpoints
    if (req.path.includes('/stream') || req.path.includes('/game')) {
      return next();
    }

    const timeout = setTimeout(() => {
      logger.error('Request timeout', {
        correlationId: req.correlationId,
        path: req.path,
        method: req.method,
        timeoutMs
      });
      res.status(408).json({ 
        error: 'Request timeout',
        requestId: req.correlationId 
      });
    }, timeoutMs);

    // Clear timeout when request completes
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Request context to logger
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      requestId: meta.correlationId,
      ...meta
    }));
  },
  error: (message, meta = {}, error = null) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      errorCode: error?.code,
      requestId: meta.correlationId,
      ...meta
    }));
  }
};

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS
const corsMiddleware = (req, res, next) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': true
  };

  // Apply CORS headers to all responses
  Object.entries(headers).forEach(([key, value]) => {
    res.header(key, value);
  });

  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  next();
};

/**
 * CORS Middleware
 * Enables Cross-Origin Resource Sharing for all routes
 * @middleware
 */
app.use(corsMiddleware);

/**
 * Security Middleware Configuration
 * @description Basic security headers using Helmet.js
 */
const helmet = require('helmet');
app.use(helmet());

/**
 * Content Security Policy (CSP)
 * @description Configures allowed sources for:
 * - Scripts, styles, images
 * - AWS services connections
 * - WebSocket connections
 * - Media and worker resources
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "https://*.amazonaws.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://*.amazonaws.com", "wss://*.amazonaws.com", "ws:"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * Request Sanitization
 * @description Sanitizes user input to prevent XSS attacks
 */
const sanitize = require('express-sanitizer');
app.use(sanitize());

/**
 * Request Abort Handler
 * @middleware Logs when client terminates connection prematurely
 */
app.use((req, res, next) => {
  req.on('close', () => {
    if (!res.writableEnded) {
      logger.info('Request aborted by client', {
        correlationId: req.correlationId,
        method: req.method,
        path: req.path
      });
    }
  });
  next();
});

/**
 * Stream Session Validation
 * @middleware Validates required fields and formats for stream sessions
 */
const { body, validationResult } = require('express-validator');

const validateStreamSession = [
  body('ApplicationIdentifier')
    .notEmpty()
    .trim()
    .isLength({ max: 256 }),
  body('StreamGroupId')
    .notEmpty()
    .trim()
    .isLength({ max: 256 }),
  body('AdditionalLaunchArgs')
    .optional()
    .isArray(),
  body('AdditionalEnvironmentVariables')
    .optional()
    .isObject(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation failed', {
        correlationId: req.correlationId,
        errors: errors.array()
      });
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * Request Body Size Limits
 * @middleware Limits request body size to 10kb
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Rate Limiter
 * @middleware Limits requests to 100 per IP per 15 minutes
 */
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: config.WINDOW_MS, // 15 minutes
  max: IS_LOCAL ? 1000 : config.MAX_REQUESTS, // Higher limit for local development
  skipFailedRequests: true, // Optional: don't count failed requests
  handler: (req, res) => {
    logger.error('Rate limit exceeded', {
      correlationId: req.correlationId,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many requests, please try again later',
      correlationId: req.correlationId
    });
  }
});
app.use(limiter);

/**
 * Global error handler
 * @middleware
 * @param {Error} err - Error object
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Express.NextFunction} next - Express next middleware function
 */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logger.error('Error occurred', {
    correlationId: req.correlationId,
    statusCode,
    errorMessage: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  res.status(statusCode).json({
    error: err.message,
    requestId: req.correlationId
  });
});

/**
 * Request Logger
 * @middleware Logs timestamp, method, and URL for each request
 */
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

/**
 * Health Check Endpoint
 * @route GET /health
 * @timeout 5000ms
 */
app.get('/health',
  timeoutMiddleware(5000), // 5 second timeout for health checks
  (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});


// Load shared AWS CLI config file
process.env.AWS_SDK_LOAD_CONFIG = '1';

// Configure AWS SDK for keep-alive reuse of HTTPS connections
process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = '1';

// Disable annoying "maintenance mode" console message
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

// Keep a simple in-memory "database" which maps unique connection tokens
const connectionDatabase = {};

// This error code is generally indicating an error occurring in server.
const generalErrorStatusCode = 502;

/**
 * Root Path Handler
 * @route GET /
 * @description Serves index.html from public directory
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Serves static files from the public directory with security restrictions.
 * 
 * @route GET /:filename
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @param {string} req.params.filename - The name of the requested file
 * 
 * @description
 * Only allows access to specific whitelisted files from the public directory.
 * Automatically determines and sets the appropriate content type for the response.
 * If the file is not in the allowed list or doesn't exist, passes to the next middleware.
 */
app.get('/:filename', (req, res, next) => {
  const filename = req.params.filename;
  const allowedFiles = ['gameliftstreams-1.0.0.js', 'touchtomouse.js', 'utils.js', 'pretty.css', 'loadingscreen.js'];
  
  if (allowedFiles.includes(filename)) {
    const filePath = path.join(__dirname, 'public', filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const contentType = getContentType(filePath);
      res.contentType(contentType);
      res.send(content);
    } else {
      next();
    }
  } else {
    next();
  }
});

/**
 * Creates a new Amazon GameLift Streams session and returns a connection token.
 * 
 * @route POST /api/CreateStreamSession
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} req.body - Request body containing stream configuration
 * @param {string} req.body.StreamGroupId - Identifier for the stream group
 * @param {string} req.body.UserId - User identifier
 * @param {Object} req.body.SignalRequest - WebRTC signaling data
 * @param {string} [req.body.ApplicationIdentifier] - Optional identifier for multi-app support
 * @param {Array} [req.body.Locations] - Optional locations for multi-region support
 * @param {Object} [req.body.AdditionalLaunchArgs] - Optional additional launch arguments
 * @param {Object} [req.body.AdditionalEnvironmentVariables] - Optional environment variables
 * 
 * @returns {Object} Response object containing a connection token
 * @returns {string} Response.Token - Unique connection identifier for the stream session
 * 
 * @description
 * Initializes a GameLift streaming session with the provided configuration.
 * Generates a unique connection token that expires after 24 hours.
 * The token can be used to retrieve the WebRTC signal response.
 */
app.post('/api/CreateStreamSession', function (req, res) {
    console.log(`CreateStreamSession request received: ${JSON.stringify(req.body)}`);

    // Ideally your backend server will validate all of these configuration parameters,
    // or ignore the client and look up predetermined values from a configuration table.
    // You likely want to override AdditionalLaunchArgs/AdditionalEnvironmentVariables.
    // At the very least, you should authenticate the user id and stream group ids here.
    // You should never trust the client! But we will trust the client for the purposes
    // of this very simple demo application.

    let streamGroupId;
    if (IS_LOCAL) {
        // In local mode, allow override from request body
        streamGroupId = req.body.StreamGroupId;
    } else {
        // In Lambda mode, use the environment variable set during deployment
        streamGroupId = process.env.STREAM_GROUP_ID;
        
        if (!streamGroupId) {
            console.error('STREAM_GROUP_ID environment variable not set');
            return res.status(500).json({
                error: 'Server Configuration Error',
                message: 'STREAM_GROUP_ID not configured'
            });
        }
    }

    const requestData = {
        Identifier: streamGroupId,
        AdditionalLaunchArgs: req.body.AdditionalLaunchArgs,
        AdditionalEnvironmentVariables: req.body.AdditionalEnvironmentVariables,
        UserId: req.body.UserId,
        Protocol: 'WebRTC',
        SignalRequest: req.body.SignalRequest,
        ConnectionTimeoutSeconds: config.STREAM_CONNECTION_TIMEOUT_SECONDS,
        SessionLengthSeconds: 3600, // limit session length to 1 hour, can be configured up to 24 hours
        ApplicationIdentifier: req.body.ApplicationIdentifier,
        Locations: req.body.locations,
    };

    gameliftstreams.startStreamSession(requestData, (err, data) => {
        if (err) {
            console.error('CreateStreamSession error:', err);
            res.status(config.GENERAL_ERROR_STATUS_CODE);
            res.json({ error: err.message });
        } else {
            console.log(`CreateStreamSession success: Arn=${JSON.stringify(data.Arn)}`);
            const connectionId = crypto.randomUUID();
            connectionDatabase[connectionId] = {
                StreamGroupId: streamGroupId, // Store the resolved streamGroupId
                StreamSessionArn: data.Arn,
                Timestamp: Date.now()
            };
            res.json({ Token: connectionId });
            setTimeout(() => { delete connectionDatabase[connectionId]; }, 24*60*60*1000);
        }
    });
});

/**
 * Retrieves the WebRTC signal response for an active streaming session.
 * 
 * @route POST /api/GetSignalResponse
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.Token - Connection token previously obtained from CreateStreamSession
 * @param {Object} res - Express response object
 * 
 * @returns {Object} Response containing signal data or error
 * @returns {string} Response.SignalResponse - WebRTC signal response if successful
 * @returns {Object} Response.error - Error details if request fails
 * @returns {string} Response.error.message - Error message if applicable
 * @returns {string} Response.error.stack - Error stack trace if applicable
 * 
 * @description
 * Validates the provided connection token and retrieves the current stream session status.
 * Returns different responses based on stream status:
 * - ACTIVATING: Returns empty SignalResponse
 * - ACTIVE: Returns WebRTC signal data
 * - Other: Returns 404 error
 * 
 * Handles protocol override when --override_protocol flag is present
 * 
 * @throws {Error} 404 - When token is invalid, expired, or stream status is unexpected
 * @throws {Error} General error status - For other failures like network issues
 */
app.post('/api/GetSignalResponse', async (req, res) => {
  const correlationId = req.correlationId;

  try {
      // Log incoming request
      logger.info('GetSignalResponse request received', {
          correlationId,
          body: req.body
      });

      // Validate connection token - moved outside nested try-catch for cleaner error handling
      
      const connectionData = req.body.Token && connectionDatabase[req.body.Token];
      if (!connectionData || !connectionData.StreamGroupId) {
          return res.status(404).json({
              error: 'Connection data not found',
              message: 'Invalid token or missing stream group ID'
          });
      }

      // Validate token expiration
      if (Date.now() - connectionData.Timestamp > config.STREAM_CONNECTION_TIMEOUT_SECONDS * 1000) {
          logger.error('Connection token expired', { correlationId });
          return res.status(404).json({ 
              error: 'Connection token expired',
              correlationId 
          });
      }

      // Prepare request data
      const requestData = {
          Identifier: connectionData.StreamGroupId,
          StreamSessionIdentifier: connectionData.StreamSessionArn,
      };

      // Get stream session data
      let streamSessionData;
      try {
          streamSessionData = await gameliftstreams.getStreamSession(requestData);
      } catch (error) {
          logger.error('GetStreamSession API call failed', {
              correlationId,
              error: error.message,
              streamGroupId: connectionData.StreamGroupId,
              sessionArn: connectionData.StreamSessionArn
          });
          throw new Error(`Failed to get stream session: ${error.message}`);
      }

      // Log successful stream session retrieval
      logger.info('GetStreamSession successful', {
          correlationId,
          status: streamSessionData.Status
      });

      // Handle different stream states
      switch (streamSessionData.Status) {
          case 'ACTIVATING':
              return res.json({ SignalResponse: '' });

          case 'ACTIVE':
              let signalResponse = streamSessionData.SignalResponse;
              
              // Handle protocol override if needed
              if (process.argv.includes('--override_protocol')) {
                  try {
                      const parsedResponse = JSON.parse(signalResponse);
                      parsedResponse.webSdkProtocolUrl = `/override_protocol.js?${Date.now()}`;
                      signalResponse = JSON.stringify(parsedResponse);
                  } catch (error) {
                      logger.error('Protocol override failed', {
                          correlationId,
                          error: error.message
                      });
                      // Continue with original response if parsing fails
                  }
              }
              
              return res.json({ SignalResponse: signalResponse });

          default:
              logger.error('Unexpected stream status', {
                  correlationId,
                  status: streamSessionData.Status
              });
              return res.status(404).json({ 
                  error: 'Unexpected stream status',
                  status: streamSessionData.Status,
                  correlationId
              });
      }

  } catch (error) {
      // Handle any uncaught errors
      logger.error('Unhandled error in GetSignalResponse', {
          correlationId,
          error: error.message,
          stack: error.stack
      });

      return res.status(generalErrorStatusCode).json({
          error: 'An error occurred while processing your request',
          correlationId,
          message: error.message,
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
  }
});

/**
 * Reconnects to an existing stream session using a previously issued connection token.
 * 
 * @route POST /api/ReconnectStreamSession
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.Token - Original connection token from CreateStreamSession
 * @param {Object} req.body.SignalRequest - WebRTC signaling data for reconnection
 * @param {Object} res - Express response object
 * 
 * @returns {Object} Response object
 * @returns {string} Response.SignalResponse - New WebRTC signal response for reconnection
 * @returns {Object} Empty object if reconnection fails
 * 
 * @description
 * Provides fast reconnection to an existing stream session without creating a new stream.
 * Uses the original connection token for authentication (basic security model).
 * Transforms existing session data into a new connection request.
 * 
 * WARNING: This implementation uses a simple token-based authentication, and is 
 * not suitable for production systems.
 * 
 * @throws {Error} 404 - When connection token is not recognized
 * @throws {Error} General error status - For stream session connection failures
 */
app.post('/api/ReconnectStreamSession', function (req, res) {
    console.log(`ReconnectStreamSession request received: ${JSON.stringify(req.body)}`);

    // For simplicity, we treat knowledge of a valid connection token as authorization.
    // This is a very simple authentication model, and relies on keeping tokens secret,
    // which users might not do! They could share browser URLs, or use a shared system
    // which leaves the client connection token around somewhere on disk.
    // You will want to add additional authentication and authorization checks here.

    // Lookup private unique connection token in "database"
    const connectionData = req.body.Token && connectionDatabase[req.body.Token];
    if (!connectionData) {
        console.log('ReconnectStreamSession connection token is not recognized');
        res.status(404);
        res.json({});
        return;
    }
    console.debug('connection data from token: ' + JSON.stringify(connectionData));

    // Transform session connection data into a new connection request
    const requestData = {
        Identifier: connectionData.StreamGroupId,
        StreamSessionIdentifier: connectionData.StreamSessionArn,
        SignalRequest: req.body.SignalRequest,
    };

    gameliftstreams.createStreamSessionConnection(requestData, (err, data) => {
        if (err) {
            console.log(`ReconnectStreamSession -> CreateStreamSessionConnection ERROR: ${err}`);
            res.status(generalErrorStatusCode);
            res.json({});
        } else {
            console.log(`ReconnectStreamSession -> CreateStreamSessionConnection SUCCESS: Arn=${JSON.stringify(req.body.StreamSessionId)}`);
            console.debug(data);
            // Return the new signal response for the client to complete reconnection
            res.json({ SignalResponse: data.SignalResponse });
        }
    });
});

/**
 * Terminates an active streaming session and cleans up associated resources.
 * 
 * @route POST /api/DestroyStreamSession
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.Token - Connection token originally issued by CreateStreamSession
 * @param {Object} res - Express response object
 * 
 * @returns {Object} Response object
 * @returns {Object} Empty object on success
 * @returns {Object} Empty object with 404 status if token is invalid
 * @returns {Object} Empty object with error status on other failures
 * 
 * @description
 * Terminates an existing GameLift stream session using the provided connection token.
 * The endpoint performs the following operations:
 * 1. Validates the connection token
 * 2. Retrieves associated stream session data
 * 3. Calls GameLift's terminateStreamSession API
 * 4. Removes the connection token from the database on success
 * 
 * State Management:
 * - On successful termination, the connection token is immediately invalidated
 * - Subsequent requests with the same token will receive 404 errors
 * - Stream enters TERMINATING status and cannot be reconnected
 * 
 * @throws {Error} 404 - When connection token is not found in database
 * @throws {Error} General error status - When stream termination fails
 * 
 * @example
 * // Request format
 * {
 *   "Token": "previously-issued-connection-token"
 * }
 * 
 * @see CreateStreamSession - For token creation
 * @see GetSignalResponse - For stream status checking
 */
app.post('/api/DestroyStreamSession', function (req, res) {
    console.log(`DestroyStreamSession request received: ${JSON.stringify(req.body)}`);

    // For simplicity, we treat knowledge of a valid connection token as authorization.
    // This is a very simple authentication model, and relies on keeping tokens secret,
    // which users might not do! They could share browser URLs, or use a shared system
    // which leaves the client connection token around somewhere on disk.
    // You will want to add additional authentication and authorization checks here.

    // Lookup private unique connection token in "database"
    const connectionData = req.body.Token && connectionDatabase[req.body.Token];
    if (!connectionData) {
        console.log('DestroyStreamSession connection token is not recognized');
        res.status(404);
        res.json({});
        return;
    }
    console.debug('connection data from token: ' + JSON.stringify(connectionData));

    const requestData = {
        Identifier: connectionData.StreamGroupId,
        StreamSessionIdentifier: connectionData.StreamSessionArn,
    };
    gameliftstreams.terminateStreamSession(requestData, (err, data) => {
        if (err) {
            console.log(`DestroyStreamSession -> TerminateStreamSession ERROR: ${err}`);
            res.status(generalErrorStatusCode);
            res.json({});
        } else {
            console.log(`DestroyStreamSession -> TerminateStreamSession SUCCESS: Arn=${JSON.stringify(connectionData.StreamSessionArn)}`);
            res.json({});

            // Purge the connection token immediately; clients can't make other
            // requests now that the stream has moved to TERMINATING status.
            delete connectionDatabase[req.body.Token];
        }
    });
});

/**
 * Gets value from command line arguments
 * @function getCommandLineValue
 * @param {string} param - Parameter to search for
 * @returns {string|undefined} Value of the parameter if found
 */
function getCommandLineValue(param) {
  const idx = process.argv.indexOf(param);
  return idx === -1 ? undefined : process.argv[idx+1];
}

/**
 * Applies command line environment variable override
 * @function applyCommandLineEnvOverride
 * @param {string} param - Parameter to search for in command line
 * @param {string} key - Environment variable key to set
 * @returns {string|undefined} The value set, if any
 */
function applyCommandLineEnvOverride(param, key) {
    const val = getCommandLineValue(param)
    if (val) {
        process.env[key] = val
    }
    return val
}

/**
 * Token cleanup job
 * Removes expired tokens from the connection database
 * Runs every minute to prevent memory leaks
 * @constant {number} config.STREAM_CONNECTION_TIMEOUT_SECONDS - Timeout in seconds
 */
setInterval(() => {
  const now = Date.now();
  Object.entries(connectionDatabase).forEach(([token, data]) => {
    if (now - data.Timestamp > config.STREAM_CONNECTION_TIMEOUT_SECONDS * 1000) {
      logger.info('Cleaning up expired token', { token });
      delete connectionDatabase[token];
    }
  });
}, config.TOKEN_CLEANUP_INTERVAL_MS); // Run every minute

/**
 * Health check endpoint
 * @route GET /api/health
 * @returns {object} Status object indicating API health
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Catch-all route for serving static files
app.use((req, res, next) => {
  const filePath = req.path.startsWith('/') ? req.path.slice(1) : req.path;
  const fullPath = path.join(__dirname, filePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const content = fs.readFileSync(fullPath);
    const contentType = getContentType(filePath);
    res.contentType(contentType);
    res.send(content);
  } else {
    next();
  }
});

/**
 * Gets content type based on file extension
 * @function getContentType
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type for the file
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Catch-all route handler for serving index.html
 * This route matches any URL path that hasn't been matched by previous routes.
 * Commonly used in Single Page Applications (SPA) to enable client-side routing.
 * 
 * @route GET *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {string} req.path - The requested URL path
 * @returns {void}
 * @throws {Error} May throw an error if file reading fails
 */
app.get('*', (req, res) => {
  console.log('Received request for:', req.path);
  const indexPath = path.join(__dirname, 'public', 'index.html');
  console.log('Attempting to serve:', indexPath);
  if (fs.existsSync(indexPath)) {
    console.log('index.html exists, sending file');
    res.sendFile(indexPath);
  } else {
    console.log('index.html not found');
    res.status(404).send('File not found');
  }
});

/**
 * Server initialization for local development
 * Sets up both HTTP and HTTPS servers with appropriate configurations
 */
if (IS_LOCAL) {
  // Create HTTPS server and listen for requests, if private key and certificate can be loaded
  let key, cert;
  try { key = fs.readFileSync(config.TLS_KEYFILE, 'utf8'); } catch { }
  try { cert = fs.readFileSync(config.TLS_CRTFILE, 'utf8'); } catch { }
  if (key && cert) {
      // Create https server
      httpsServer = https.createServer({key, cert}, app);

      // Test if port is open for IPV4 first
      httpsServer.listen(config.LISTEN_PORT_HTTPS, '0.0.0.0', (err) => {
          if (!err) {
              // Close server and continue
              httpsServer.close();
          }
          // Test if port is open for IPV6 next
          httpsServer.listen(config.LISTEN_PORT_HTTPS, (err) => {
              if (err) {
                  throw err;
              }
              // Only start server if neither protocol throws an error for given port
              console.log(`Listening on HTTPS port ${config.LISTEN_PORT_HTTPS}`)
          })
      });
  } else {
      console.log('Unable to load TLS certificate and private key for HTTPS');
  }

  // Create HTTP server
  httpServer = http.createServer(app);

  // Test if port is open for IPV4 first
  httpServer.listen(config.LISTEN_PORT_HTTP, '0.0.0.0', (err) => {
    if (!err) {
        // Close server and continue
        httpServer.close();
    }
    // Test if port is open for IPV6 next
    httpServer.listen(config.LISTEN_PORT_HTTP, (err) => {
        if (err) {
            throw err;
        }
        // Only start server if neither protocol throws an error for given port
        console.log(`Listening on HTTP port ${config.LISTEN_PORT_HTTP}`)
    })

  });
} else {
  // Lambda setup
  console.log('Running in Lambda mode');
  const handler = serverless(app);
  exports.handler = async (event, context) => {
      console.log('Lambda handler invoked');
      return await handler(event, context);
  };
}

/**
 * Graceful shutdown handler
 * Properly closes server connections when receiving SIGTERM
 * @listens process#SIGTERM
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

/**
 * Request tracking middleware
 * Logs request details and timing information
 * @middleware
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Express.NextFunction} next - Express next middleware function
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    logger.info('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - startTime
    });
  });
  next();
});

/**
 * Middleware to add API version header to all responses
 * @middleware
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Express.NextFunction} next - Express next middleware function
 */
app.use((req, res, next) => {
  // Set custom header to inform clients about the API version being used
  // This helps with API versioning and client compatibility tracking
  res.setHeader('X-API-Version', config.API_VERSION);
  next();
});
