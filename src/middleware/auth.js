/**
 * Authentication Middleware
 * Validates JWT tokens in the Authorization header.
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');

/**
 * Middleware function to enforce authentication for protected routes.
 * It checks the "Authorization" header for a "Bearer <token>" pattern.
 * If valid, it attaches the decoded token payload to `req.user`.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 * @returns {void}
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return next(new AppError({
      type: 'https://liquifact.com/probs/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Authentication token is required',
      instance: req.originalUrl,
    }));
  }

  const tokenParts = authHeader.split(' ');
  
  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return next(new AppError({
      type: 'https://liquifact.com/probs/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid Authorization header format. Expected "Bearer <token>"',
      instance: req.originalUrl,
    }));
  }

  const token = tokenParts[1];
  const secret = process.env.JWT_SECRET || 'test-secret'; // Fallback for local testing if env is not completely set

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError({
          type: 'https://liquifact.com/probs/token-expired',
          title: 'Token Expired',
          status: 401,
          detail: 'Token has expired',
          instance: req.originalUrl,
        }));
      }
      return next(new AppError({
        type: 'https://liquifact.com/probs/invalid-token',
        title: 'Invalid Token',
        status: 401,
        detail: 'Invalid token',
        instance: req.originalUrl,
      }));
    }
    
    // Attach user info to the request pattern
    req.user = decoded;
    next();
  });
};

module.exports = { authenticateToken };
