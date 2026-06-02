---
name: Use NestJS Logger, not console.log
description: Always use NestJS Logger for logging, never console.log
type: feedback
---

Never use `console.log` for logging. Always use NestJS `Logger` from `@nestjs/common`.

**Why:** Project convention.

**How to apply:** Instantiate `private readonly logger = new Logger(ClassName.name)` and use `this.logger.log()`, `this.logger.debug()`, `this.logger.error()`, etc.
