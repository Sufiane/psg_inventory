# Graph Report - .  (2026-06-01)

## Corpus Check
- Corpus is ~10,813 words - fits in a single context window. You may not need a graph.

## Summary
- 486 nodes · 918 edges · 33 communities (23 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.81)
- Token cost: 178,573 input · 31,510 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin Module|Admin Module]]
- [[_COMMUNITY_DB  Redis  Auth Infra|DB / Redis / Auth Infra]]
- [[_COMMUNITY_Accounting Service|Accounting Service]]
- [[_COMMUNITY_Sales DTOs + Decorators|Sales DTOs + Decorators]]
- [[_COMMUNITY_Matches Module|Matches Module]]
- [[_COMMUNITY_Auth Service & Guards|Auth Service & Guards]]
- [[_COMMUNITY_Cancel-Sales Cron|Cancel-Sales Cron]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Dev Dependencies & Tooling|Dev Dependencies & Tooling]]
- [[_COMMUNITY_TSConfig Compiler Options|TSConfig Compiler Options]]
- [[_COMMUNITY_DTOInterface Class Refs|DTO/Interface Class Refs]]
- [[_COMMUNITY_Project Concepts|Project Concepts]]
- [[_COMMUNITY_NPM Scripts|NPM Scripts]]
- [[_COMMUNITY_Jest Config|Jest Config]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Error Logging Rule|Error Logging Rule]]
- [[_COMMUNITY_Nest CLI Config|Nest CLI Config]]
- [[_COMMUNITY_Auth Guards  Public Bypass|Auth Guards / Public Bypass]]
- [[_COMMUNITY_Users Module|Users Module]]
- [[_COMMUNITY_Auth Strategy Validate Trio|Auth Strategy Validate Trio]]
- [[_COMMUNITY_TSConfig Build Variant|TSConfig Build Variant]]
- [[_COMMUNITY_Football Season Logic|Football Season Logic]]
- [[_COMMUNITY_Matches Service Lookups|Matches Service Lookups]]
- [[_COMMUNITY_Prisma Migrations|Prisma Migrations]]
- [[_COMMUNITY_API FormattedMatch Type|API FormattedMatch Type]]
- [[_COMMUNITY_Shared FormattedMatch Type|Shared FormattedMatch Type]]
- [[_COMMUNITY_Users Concept|Users Concept]]
- [[_COMMUNITY_Competitions Type|Competitions Type]]
- [[_COMMUNITY_Auth Login Method|Auth Login Method]]
- [[_COMMUNITY_Match Create Method|Match Create Method]]
- [[_COMMUNITY_Boolean Util|Boolean Util]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `toHttpException()` - 19 edges
3. `AuthenticatedUser` - 19 edges
4. `RedisService` - 18 edges
5. `scripts` - 14 edges
6. `SalesService` - 13 edges
7. `TimePeriodAccounting` - 12 edges
8. `ErrorCode` - 11 edges
9. `Match` - 11 edges
10. `PrismaService` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Use NestJS Logger not console.log` --conceptually_related_to--> `no-console ESLint rule`  [INFERRED]
  .claude/projects/-Users-sufianesouissi-Development-psg-inventory/memory/feedback_logger.md → eslint.config.mjs
- `no-console ESLint rule` --rationale_for--> `NestJS Logger`  [INFERRED]
  eslint.config.mjs → .claude/projects/-Users-sufianesouissi-Development-psg-inventory/memory/feedback_logger.md
- `MatchesController` --semantically_similar_to--> `SalesController`  [INFERRED] [semantically similar]
  src/api/matches/matches.controller.ts → src/api/sales/sales.controller.ts
- `MatchesService` --semantically_similar_to--> `SalesService`  [INFERRED] [semantically similar]
  src/api/matches/matches.service.ts → src/api/sales/sales.service.ts
- `UsersService` --semantically_similar_to--> `SalesService`  [INFERRED] [semantically similar]
  src/api/users/users.service.ts → src/db/sales/sales.service.ts

## Import Cycles
- 2-file cycle: `src/db/matches/matches.service.ts -> src/db/matches/types/match.type.ts -> src/db/matches/matches.service.ts`
- 3-file cycle: `src/db/matches/matches.db.interface.ts -> src/db/matches/types/match.type.ts -> src/db/matches/matches.service.ts -> src/db/matches/matches.db.interface.ts`

## Hyperedges (group relationships)
- **API modules under src/api** — concept_users_module, concept_matches_module, concept_sales_module, concept_accounting_module, concept_admin_module [EXTRACTED 1.00]
- **Core tech stack** — concept_nestjs_framework, concept_prisma_postgres, concept_redis_cache, concept_passport_bcrypt [EXTRACTED 1.00]
- **Logging convention enforcement** — feedback_logger, nestjs_logger, concept_no_console_rule [INFERRED 0.85]
- **Accounting hexagonal module trio** — accounting_accounting_controller, accounting_accounting_service, accounting_iaccountingservice [INFERRED 0.95]
- **Admin hexagonal module trio** — admin_admin_controller, admin_admin_service, admin_iadminservice [INFERRED 0.95]
- **Aggregate format pipeline** — accounting_accounting_service, utils_format_aggregate, accounting_aggregate_payload, accounting_formatted_aggregate [INFERRED 0.85]
- **Matches hexagonal triad** — matches_matchescontroller, matches_matchesservice, interfaces_imatchesservice [INFERRED 0.85]
- **Sales hexagonal triad** — sales_salescontroller, sales_salesservice, interfaces_isalesservice [INFERRED 0.85]
- **Match formatting pipeline** — matches_matchesservice, formatters_formatmatch, types_formattedmatch [INFERRED 0.85]
- **Auth strategies + service form passport auth flow** — auth_auth_service, strategies_jwt_strategy, strategies_local_strategy [INFERRED 0.85]
- **Domain exception, codes, and HTTP mapper form error handling pipeline** — exceptions_domain_exception, exceptions_error_codes_enum, exceptions_http_exception_mapper [EXTRACTED 1.00]
- **Cancel-sales controller, service, module participate in cron flow** — cancel_sales_cancel_sales_controller, cancel_sales_cancel_sales_service, cancel_sales_cancel_sales_module [EXTRACTED 1.00]
- **Sales caching layer** — sales_sales_service, redis_redis_service, redis_cache_keys [INFERRED 0.85]
- **Hexagonal sales module** — sales_sales_db_interface, sales_sales_service, db_prisma_service [INFERRED 0.85]
- **Redis service stack** — redis_base_service, redis_redis_service, redis_redis_module [EXTRACTED 1.00]
- **NestJS auth guard stack** — guards_jwt_auth_guard, guards_local_auth_guard, guards_roles_guard, decorators_user_decorator [INFERRED 0.85]
- **Shared cross-cutting utilities** — utils_get_current_season_date, utils_convert_string_to_boolean, types_formatted_match [INFERRED 0.65]

## Communities (33 total, 10 thin omitted)

### Community 0 - "Admin Module"
Cohesion: 0.07
Nodes (27): AdminController, AdminModule, AdminService, CreateMatchDto, IAdminService, LoadSeasonMatchesDto, AdminService.spec, CreateMatchDto (+19 more)

### Community 1 - "DB / Redis / Auth Infra"
Cohesion: 0.07
Nodes (17): IAccountingDbService, AccountingService.getAccounting, AuthService.hashPassword, PrismaService, BaseRedis, RedisService, ISalesDbService, SalesService (+9 more)

### Community 2 - "Accounting Service"
Cohesion: 0.08
Nodes (28): AccountingService, formatAggregateMocked, getCurrentSeasonDateMocked, Accounting, AggregatePayload, FormattedAggregate, GetSeasonDto, IAccountingService (+20 more)

### Community 3 - "Sales DTOs + Decorators"
Cohesion: 0.11
Nodes (14): AccountingController, Admin role authorization, User, AddSaleDto, DeleteSaleDto, GetSaleDto, UpdateSaleDto, toHttpException() (+6 more)

### Community 4 - "Matches Module"
Cohesion: 0.12
Nodes (12): GetMatchDto, GetSeasonMatchesDto, QueryMatchDto, formatMatch(), IMatchesService, MatchesController, IMatchesDbService, MatchesService (db) (+4 more)

### Community 5 - "Auth Service & Guards"
Cohesion: 0.12
Nodes (11): AuthModule, AuthService, CreateUserDto, LocalAuthGuard, IAuthService, IUsersService, UsersService, JwtStrategy (+3 more)

### Community 6 - "Cancel-Sales Cron"
Cohesion: 0.08
Nodes (16): AccountingModule, CancelSalesController, CancelSalesModule, CancelSalesService.cancelSales, CancelSalesService, CronModule, DbModule, Public() (+8 more)

### Community 7 - "Runtime Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, bcrypt, class-transformer, class-validator, date-fns, @nestjs/common, @nestjs/config, @nestjs/core (+16 more)

### Community 8 - "Dev Dependencies & Tooling"
Cohesion: 0.09
Nodes (21): devDependencies, eslint, @eslint/js, globals, husky, jest, jest-mock-extended, lint-staged (+13 more)

### Community 9 - "TSConfig Compiler Options"
Cohesion: 0.10
Nodes (20): compilerOptions, allowSyntheticDefaultImports, emitDecoratorMetadata, esModuleInterop, exactOptionalPropertyTypes, experimentalDecorators, forceConsistentCasingInFileNames, incremental (+12 more)

### Community 10 - "DTO/Interface Class Refs"
Cohesion: 0.16
Nodes (19): AddSaleDto, DeleteSaleDto, GetMatchDto, GetSaleDto, GetSeasonMatchesDto, QueryMatchDto, UpdateSaleDto, formatMatch (+11 more)

### Community 11 - "Project Concepts"
Cohesion: 0.13
Nodes (17): Accounting module, Admin module, Financial Summaries (Accounting), Football Data API v4, JWT Authentication with RBAC, Matches module, NestJS 10 (Express), Passport.js + bcrypt auth (+9 more)

### Community 12 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, format, lint, prepare, start, start:debug, start:dev (+6 more)

### Community 13 - "Jest Config"
Cohesion: 0.22
Nodes (9): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+1 more)

### Community 14 - "Package Metadata"
Cohesion: 0.22
Nodes (8): author, description, license, name, prisma, schema, private, version

### Community 15 - "Error Logging Rule"
Cohesion: 0.40
Nodes (5): no-console ESLint rule, Full error logging is intentional, Use NestJS Logger not console.log, Memory Index, NestJS Logger

### Community 16 - "Nest CLI Config"
Cohesion: 0.50
Nodes (3): collection, $schema, sourceRoot

### Community 17 - "Auth Guards / Public Bypass"
Cohesion: 0.67
Nodes (3): Public route auth bypass, JwtAuthGuard, LocalAuthGuard

### Community 18 - "Users Module"
Cohesion: 1.00
Nodes (3): CreateUserDto, IUsersService, UsersController

### Community 19 - "Auth Strategy Validate Trio"
Cohesion: 0.67
Nodes (3): AuthService.validateUser, JwtStrategy.validate, LocalStrategy.validate

### Community 21 - "Football Season Logic"
Cohesion: 0.67
Nodes (3): Football season Aug-July window, FormattedMatch type, getCurrentSeasonDate

## Knowledge Gaps
- **155 isolated node(s):** `husky.sh script`, `$schema`, `collection`, `sourceRoot`, `name` (+150 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AccountingService` connect `Accounting Service` to `Admin Module`, `DB / Redis / Auth Infra`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `toHttpException()` connect `Sales DTOs + Decorators` to `Admin Module`, `Accounting Service`, `Matches Module`, `Auth Service & Guards`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `RedisService` connect `DB / Redis / Auth Infra` to `Admin Module`, `Accounting Service`, `Sales DTOs + Decorators`, `Matches Module`, `Cancel-Sales Cron`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `husky.sh script`, `$schema`, `collection` to the rest of the system?**
  _155 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Module` be split into smaller, more focused modules?**
  _Cohesion score 0.07017543859649122 - nodes in this community are weakly interconnected._
- **Should `DB / Redis / Auth Infra` be split into smaller, more focused modules?**
  _Cohesion score 0.06936026936026936 - nodes in this community are weakly interconnected._
- **Should `Accounting Service` be split into smaller, more focused modules?**
  _Cohesion score 0.07993197278911565 - nodes in this community are weakly interconnected._