/**
 * Quota Provider Interface
 *
 * Defines the contract for implementing quota providers.
 * @module quota/providers
 */

/**
 * @typedef {Object} UsageWindow
 * @property {number|null} usedPercent - Percentage of usage (0-100)
 * @property {number|null} remainingPercent - Percentage remaining (0-100)
 * @property {number|null} windowSeconds - Window duration in seconds
 * @property {number|null} resetAfterSeconds - Seconds until reset
 * @property {number|null} resetAt - Unix timestamp when quota resets
 * @property {string|null} resetAtFormatted - Human-readable reset time
 * @property {string|null} resetAfterFormatted - Human-readable time until reset
 * @property {string|null} valueLabel - Optional label for display (e.g., "$10.00 remaining")
 */

/**
 * @typedef {Object} ProviderUsage
 * @property {Object.<string, UsageWindow>} windows - Usage windows by key (e.g., '5h', '7d', 'daily')
 * @property {Object.<string, Object>} [models] - Model-specific usage (provider-specific)
 */

/**
 * @typedef {Object} QuotaProviderResult
 * @property {string} providerId - Unique identifier for the provider
 * @property {string} providerName - Display name for the provider
 * @property {boolean} ok - Whether the fetch was successful
 * @property {boolean} configured - Whether the provider is configured
 * @property {ProviderUsage|null} usage - Usage data if successful
 * @property {string|null} [error] - Error message if not successful
 * @property {number} fetchedAt - Unix timestamp when the result was fetched
 */

/**
 * @typedef {Function} ProviderQuotaFetcher
 * @returns {Promise<QuotaProviderResult>}
 */

/**
 * @typedef {Function} ProviderConfigurationChecker
 * @param {Object.<string, unknown>} [auth]
 * @returns {boolean}
 */

/**
 * @typedef {Object} QuotaProvider
 * @property {string} providerId
 * @property {string} providerName
 * @property {string[]} aliases
 * @property {ProviderConfigurationChecker} isConfigured
 * @property {ProviderQuotaFetcher} fetchQuota
 */
