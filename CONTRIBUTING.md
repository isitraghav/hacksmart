# Contributing to HackSmart

Thank you for your interest in contributing to HackSmart! This document provides guidelines and best practices.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install` (server) and `flutter pub get` (app)
3. Set up your local database
4. Copy `.env.example` to `.env` and configure
5. Run migrations: `npm run migrate`
6. Generate demo data: `npm run db:reset`

## Code Style

### Backend (Node.js)
- Use ES6+ features
- Follow existing code structure
- Add JSDoc comments for functions
- Use meaningful variable names
- Keep functions small and focused

### Frontend (Flutter/Dart)
- Follow Flutter style guide
- Use widgets for reusable components
- Implement proper state management
- Add comments for complex logic

## Commit Messages

Follow conventional commits format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Build/tooling changes

Example:
```
feat(rebalancing): add multi-warehouse source selection

Implements logic to select optimal warehouse for battery transfers
based on distance and inventory levels.

Closes #123
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Add tests for new functionality
4. Update documentation as needed
5. Ensure all tests pass: `npm run test:all`
6. Submit pull request with detailed description

## Testing Guidelines

- Write tests for new features
- Maintain test coverage above 70%
- Include both unit and integration tests
- Test edge cases and error conditions

## Documentation

- Update README.md for significant changes
- Add JSDoc/DartDoc comments
- Update API documentation
- Include usage examples

## Code Review

All submissions require review. We'll review:
- Code quality and style
- Test coverage
- Performance implications
- Security considerations
- Documentation completeness

## Questions?

Open an issue for questions or discussions.
