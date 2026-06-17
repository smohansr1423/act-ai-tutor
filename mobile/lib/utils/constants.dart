/// App-wide constants.
class AppConstants {
  AppConstants._();

  /// Base URL for the backend API.
  /// Change this to your Railway deployment URL after deploying.
  /// Format: https://your-app-name.up.railway.app/api
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );

  /// Timeout for general API calls in seconds.
  static const int defaultTimeoutSeconds = 10;

  /// Timeout for question generation in seconds (per requirement 2.1).
  static const int questionGenerationTimeoutSeconds = 8;

  /// Timeout for chat text response in seconds (per requirement 6.1).
  static const int chatTextTimeoutSeconds = 5;

  /// Timeout for chat image processing in seconds (per requirement 6.2).
  static const int chatImageTimeoutSeconds = 10;

  /// Maximum chat message length in characters (per requirement 6.8).
  static const int maxChatMessageLength = 1000;

  /// Maximum chat messages retained in context (per requirement 6.7).
  static const int maxChatContextMessages = 50;

  /// Maximum image upload size in bytes (10 MB per requirement 6.2).
  static const int maxImageSizeBytes = 10 * 1024 * 1024;

  /// Sync retry attempts (per requirement 10.4).
  static const int syncRetryAttempts = 3;

  /// Sync retry interval in seconds (per requirement 10.4).
  static const int syncRetryIntervalSeconds = 10;

  /// Full test section configurations (per requirements 4.1-4.4).
  static const Map<String, Map<String, int>> fullTestConfig = {
    'english': {'questions': 75, 'timeMinutes': 45},
    'math': {'questions': 60, 'timeMinutes': 60},
    'reading': {'questions': 40, 'timeMinutes': 35},
    'science': {'questions': 40, 'timeMinutes': 35},
  };

  /// SharedPreferences keys.
  static const String tokenKey = 'jwt_token';
  static const String userIdKey = 'user_id';
  static const String userRoleKey = 'user_role';
}
