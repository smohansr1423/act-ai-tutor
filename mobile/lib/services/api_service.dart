import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/constants.dart';

/// Exception thrown when an API request fails.
class ApiException implements Exception {
  final int statusCode;
  final String message;

  const ApiException({required this.statusCode, required this.message});

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Base API service that handles HTTP communication with the backend.
/// Includes JWT authentication headers, timeout handling, and error parsing.
class ApiService {
  final String baseUrl;
  final http.Client _client;

  ApiService({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = baseUrl ?? AppConstants.apiBaseUrl,
        _client = client ?? http.Client();

  /// Retrieve the stored JWT token from SharedPreferences.
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.tokenKey);
  }

  /// Store the JWT token after login/registration.
  Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.tokenKey, token);
  }

  /// Clear stored authentication data on logout.
  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.userIdKey);
    await prefs.remove(AppConstants.userRoleKey);
  }

  /// Build request headers with optional JWT authorization.
  Future<Map<String, String>> _buildHeaders({
    bool requiresAuth = true,
    String contentType = 'application/json',
  }) async {
    final headers = <String, String>{
      HttpHeaders.contentTypeHeader: contentType,
      HttpHeaders.acceptHeader: 'application/json',
    };

    if (requiresAuth) {
      final token = await _getToken();
      if (token != null && token.isNotEmpty) {
        headers[HttpHeaders.authorizationHeader] = 'Bearer $token';
      }
    }

    return headers;
  }

  /// Perform a GET request.
  Future<Map<String, dynamic>> get(
    String endpoint, {
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final headers = await _buildHeaders(requiresAuth: requiresAuth);

    final response = await _client
        .get(uri, headers: headers)
        .timeout(
          Duration(
            seconds: timeoutSeconds ?? AppConstants.defaultTimeoutSeconds,
          ),
        );

    return _handleResponse(response);
  }

  /// Perform a POST request with a JSON body.
  Future<Map<String, dynamic>> post(
    String endpoint, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final headers = await _buildHeaders(requiresAuth: requiresAuth);

    final response = await _client
        .post(
          uri,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(
          Duration(
            seconds: timeoutSeconds ?? AppConstants.defaultTimeoutSeconds,
          ),
        );

    return _handleResponse(response);
  }

  /// Perform a multipart POST request (for image uploads).
  Future<Map<String, dynamic>> uploadImage(
    String endpoint, {
    required File imageFile,
    Map<String, String>? fields,
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final request = http.MultipartRequest('POST', uri);

    // Add auth header
    if (requiresAuth) {
      final token = await _getToken();
      if (token != null && token.isNotEmpty) {
        request.headers[HttpHeaders.authorizationHeader] = 'Bearer $token';
      }
    }

    // Add fields
    if (fields != null) {
      request.fields.addAll(fields);
    }

    // Add file
    request.files.add(
      await http.MultipartFile.fromPath('image', imageFile.path),
    );

    final streamedResponse = await request.send().timeout(
          Duration(
            seconds: timeoutSeconds ?? AppConstants.chatImageTimeoutSeconds,
          ),
        );

    final response = await http.Response.fromStream(streamedResponse);
    return _handleResponse(response);
  }

  /// Parse the response and throw an ApiException on error.
  Map<String, dynamic> _handleResponse(http.Response response) {
    final body = response.body.isNotEmpty
        ? jsonDecode(response.body) as Map<String, dynamic>
        : <String, dynamic>{};

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    final message = body['message'] as String? ??
        body['error'] as String? ??
        'Request failed with status ${response.statusCode}';

    throw ApiException(
      statusCode: response.statusCode,
      message: message,
    );
  }

  /// Dispose of the HTTP client.
  void dispose() {
    _client.close();
  }
}
