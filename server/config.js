/**
 * config.js
 * 
 * Configuration file for Amazon GameLift Streams Web Sharing Demo
 * This file contains all configurable constants used throughout the application.
 * Modify these values to customize the server behavior for different environments.
 */

module.exports = {
  /**
   * Server Environment Configuration
   */

  /**
   * HTTP port for the server
   * Used when running in local development mode
   * @type {number}
   */
  LISTEN_PORT_HTTP: 5000,

  /**
   * HTTPS port for the server
   * Used when running in local development mode with SSL/TLS
   * @type {number}
   */
  LISTEN_PORT_HTTPS: 5443,

  /**
   * File path for the TLS private key
   * Required for HTTPS server setup in local mode
   * @type {string}
   */
  TLS_KEYFILE: 'server.key',

  /**
   * File path for the TLS certificate
   * Required for HTTPS server setup in local mode
   * @type {string}
   */
  TLS_CRTFILE: 'server.crt',

  /**
   * API Configuration
   */

  /**
   * Current API version following semantic versioning (major.minor.patch)
   * Used to inform clients about the API version being used
   * @type {string}
   */
  API_VERSION: '1.0.0',

  /**
   * HTTP status code for general server errors
   * Used when a more specific error code is not applicable
   * @type {number}
   */
  GENERAL_ERROR_STATUS_CODE: 502,

  /**
   * GameLift Streams Configuration
   */

  /**
   * Timeout duration for stream connections in seconds
   * Determines how long a connection token remains valid
   * @type {number}
   */
  STREAM_CONNECTION_TIMEOUT_SECONDS: 600,

  /**
   * Maximum session length in seconds
   * Note: GameLiftStreams stream duration limit is 24 hours
   * @type {number}
   */
  MAX_SESSION_LENGTH_SECONDS: 12 * 3600,

  /**
   * GameLift Streams StreamGroupID
   * @type {string}
   */
  STREAM_GROUP_ID: process.env.STREAM_GROUP_ID,

  /**
   * AWS region for GameLift Streams service
   * Update this to match your deployment region
   * @type {string}
   */
  GAMELIFT_STREAMS_REGION: 'us-west-2',

  /**
   * Optional endpoint override for Amazon GameLift Streams API
   * This may change based on your AWS setup and region
   * Set to null to use the default AWS endpoint for the region
   * @type {string|null}
   */

  GAMELIFT_STREAMS_ENDPOINT: null,

  /**
   * Security Configuration
   */

  /**
   * Maximum size limit for JSON payloads in requests
   * Helps prevent large payload attacks
   * @type {string}
   */
  JSON_BODY_LIMIT: '100mb',

  /**
   * Rate limiting configuration
   * Limits the number of requests from a single IP address
   */
  RATE_LIMIT: {
    /**
     * Time window for rate limiting in milliseconds
     * @type {number}
     */
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes

    /**
     * Maximum number of requests per IP within the time window
     * @type {number}
     */
    MAX_REQUESTS: 100
  },

  /**
   * Performance Configuration
   */

  /**
   * Request timeout in milliseconds
   * Maximum time allowed for processing a request
   * @type {number}
   */
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds

  /**
   * Interval for running the token cleanup job in milliseconds
   * @type {number}
   */
  TOKEN_CLEANUP_INTERVAL_MS: 60000, // 1 minute
};
