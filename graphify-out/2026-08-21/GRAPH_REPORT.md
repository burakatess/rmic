# Graph Report - .  (2026-06-02)

## Corpus Check
- 172 files · ~132,935 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1192 nodes · 1739 edges · 91 communities (70 shown, 21 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend API Client Layer|Frontend API Client Layer]]
- [[_COMMUNITY_Risk Data Transfer Objects|Risk Data Transfer Objects]]
- [[_COMMUNITY_Frontend Dependencies Config|Frontend Dependencies Config]]
- [[_COMMUNITY_Controls Backend Module|Controls Backend Module]]
- [[_COMMUNITY_Compliance Backend Module|Compliance Backend Module]]
- [[_COMMUNITY_Reports Backend Module|Reports Backend Module]]
- [[_COMMUNITY_Auth Backend Module|Auth Backend Module]]
- [[_COMMUNITY_Backend Dev Config|Backend Dev Config]]
- [[_COMMUNITY_Risk UI Components|Risk UI Components]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_Admin Backend Module|Admin Backend Module]]
- [[_COMMUNITY_Root Package Config|Root Package Config]]
- [[_COMMUNITY_Risk Entry Backend Module|Risk Entry Backend Module]]
- [[_COMMUNITY_Admin Service Layer|Admin Service Layer]]
- [[_COMMUNITY_Deployment & Testing Infrastructure|Deployment & Testing Infrastructure]]
- [[_COMMUNITY_Backend TypeScript Config|Backend TypeScript Config]]
- [[_COMMUNITY_Frontend Type Definitions|Frontend Type Definitions]]
- [[_COMMUNITY_Shared Type Definitions|Shared Type Definitions]]
- [[_COMMUNITY_Actions UI Page|Actions UI Page]]
- [[_COMMUNITY_Backend Runtime Dependencies|Backend Runtime Dependencies]]
- [[_COMMUNITY_Frontend TypeScript Config|Frontend TypeScript Config]]
- [[_COMMUNITY_Risk Form Modal|Risk Form Modal]]
- [[_COMMUNITY_Auth Guards & Prisma Module|Auth Guards & Prisma Module]]
- [[_COMMUNITY_Service Dependency Injection|Service Dependency Injection]]
- [[_COMMUNITY_Audits Backend Module|Audits Backend Module]]
- [[_COMMUNITY_Backend Build Scripts|Backend Build Scripts]]
- [[_COMMUNITY_Findings Detail UI|Findings Detail UI]]
- [[_COMMUNITY_Risk Control Scoring Service|Risk Control Scoring Service]]
- [[_COMMUNITY_Actions Backend Module|Actions Backend Module]]
- [[_COMMUNITY_Control Agenda Kanban UI|Control Agenda Kanban UI]]
- [[_COMMUNITY_Risks UI Components|Risks UI Components]]
- [[_COMMUNITY_Auth & Controls UI|Auth & Controls UI]]
- [[_COMMUNITY_Create Finding Modal|Create Finding Modal]]
- [[_COMMUNITY_Audit Controller Operations|Audit Controller Operations]]
- [[_COMMUNITY_API & Mapping Layer|API & Mapping Layer]]
- [[_COMMUNITY_App Layout & Metadata|App Layout & Metadata]]
- [[_COMMUNITY_Permission-Based UI|Permission-Based UI]]
- [[_COMMUNITY_Audit Executions UI|Audit Executions UI]]
- [[_COMMUNITY_Controls Detail UI|Controls Detail UI]]
- [[_COMMUNITY_Risk Control Controller|Risk Control Controller]]
- [[_COMMUNITY_Actions Controller Operations|Actions Controller Operations]]
- [[_COMMUNITY_Actions Service Layer|Actions Service Layer]]
- [[_COMMUNITY_Risk Creation Pages|Risk Creation Pages]]
- [[_COMMUNITY_Audit Plan Detail UI|Audit Plan Detail UI]]
- [[_COMMUNITY_Audit Plans UI|Audit Plans UI]]
- [[_COMMUNITY_Confirm Dialog Component|Confirm Dialog Component]]
- [[_COMMUNITY_Backend Test Configuration|Backend Test Configuration]]
- [[_COMMUNITY_Dashboard Analytics UI|Dashboard Analytics UI]]
- [[_COMMUNITY_Findings List UI|Findings List UI]]
- [[_COMMUNITY_Dashboard Layout & Navigation|Dashboard Layout & Navigation]]
- [[_COMMUNITY_Risk Entry Table UI|Risk Entry Table UI]]
- [[_COMMUNITY_Compliance Mapping UI|Compliance Mapping UI]]
- [[_COMMUNITY_App Root Controller|App Root Controller]]
- [[_COMMUNITY_Auth Context Provider|Auth Context Provider]]
- [[_COMMUNITY_Backend Package Metadata|Backend Package Metadata]]
- [[_COMMUNITY_Audit Plan Edit UI|Audit Plan Edit UI]]
- [[_COMMUNITY_Control Edit UI|Control Edit UI]]
- [[_COMMUNITY_EK6 Report UI|EK6 Report UI]]
- [[_COMMUNITY_Action Detail UI|Action Detail UI]]
- [[_COMMUNITY_System Parameters UI|System Parameters UI]]
- [[_COMMUNITY_E2E Test Config|E2E Test Config]]
- [[_COMMUNITY_Risk Treatment UI|Risk Treatment UI]]
- [[_COMMUNITY_NestJS CLI Config|NestJS CLI Config]]
- [[_COMMUNITY_Action Edit UI|Action Edit UI]]
- [[_COMMUNITY_Finding Edit UI|Finding Edit UI]]
- [[_COMMUNITY_Risk Control Flow UI|Risk Control Flow UI]]
- [[_COMMUNITY_New Audit Plan UI|New Audit Plan UI]]
- [[_COMMUNITY_New Control UI|New Control UI]]
- [[_COMMUNITY_Integrations UI|Integrations UI]]
- [[_COMMUNITY_Header & Search UI|Header & Search UI]]
- [[_COMMUNITY_Public UI Assets|Public UI Assets]]
- [[_COMMUNITY_Role Management UI|Role Management UI]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Test Generation Controller|Test Generation Controller]]
- [[_COMMUNITY_Admin Module Assembly|Admin Module Assembly]]
- [[_COMMUNITY_Risk-Controls Mapping UI|Risk-Controls Mapping UI]]
- [[_COMMUNITY_Action Effectiveness UI|Action Effectiveness UI]]
- [[_COMMUNITY_Database Seed Scripts|Database Seed Scripts]]
- [[_COMMUNITY_User Management UI|User Management UI]]
- [[_COMMUNITY_Backend Build Exclusions|Backend Build Exclusions]]
- [[_COMMUNITY_Frontend Jest Config|Frontend Jest Config]]
- [[_COMMUNITY_Resizable Columns Hook|Resizable Columns Hook]]
- [[_COMMUNITY_Frontend ESLint Config|Frontend ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Ignis Brand Identity|Ignis Brand Identity]]

## God Nodes (most connected - your core abstractions)
1. `ApiClient` - 65 edges
2. `PrismaService` - 33 edges
3. `AdminService` - 27 edges
4. `AdminController` - 25 edges
5. `useToast()` - 23 edges
6. `compilerOptions` - 22 edges
7. `ControlsService` - 21 edges
8. `RiskManagementControlsService` - 20 edges
9. `RisksService` - 20 edges
10. `Button()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CI PostgreSQL 16 Service` --semantically_similar_to--> `Docker PostgreSQL Service`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → docker-compose.yml
- `PermissionGate()` --calls--> `hasAllPermissions()`  [INFERRED]
  frontend/src/components/auth/AuthProvider.tsx → shared/types/permissions.ts
- `PermissionGate()` --calls--> `hasAnyPermission()`  [INFERRED]
  frontend/src/components/auth/AuthProvider.tsx → shared/types/permissions.ts
- `ActionEditPage()` --calls--> `useRouter()`  [INFERRED]
  frontend/src/app/(dashboard)/actions/[id]/edit/page.tsx → frontend/__tests__/login.test.tsx
- `Header()` --calls--> `useRouter()`  [INFERRED]
  frontend/src/components/layout/Header.tsx → frontend/__tests__/login.test.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Full-Stack Deployment Triad (PostgreSQL + Backend + Frontend)** — docker_compose_postgres_service, docker_compose_backend_service, docker_compose_frontend_service [EXTRACTED 1.00]
- **CI Build and Test Pipeline (Backend Job + Frontend Job + Postgres Service)** — workflows_ci_backend_job, workflows_ci_frontend_job, workflows_ci_postgres_service [EXTRACTED 1.00]
- **GRC Business Module Suite (Risks, Controls, Audits, Findings, Actions, Compliance)** — root_readme_module_risks, root_readme_module_controls, root_readme_module_audits, root_readme_module_findings, root_readme_module_actions, root_readme_module_compliance [EXTRACTED 1.00]

## Communities (91 total, 21 thin omitted)

### Community 1 - "Risk Data Transfer Objects"
Cohesion: 0.09
Nodes (10): AssessRiskDto, CreateRiskDto, RiskQueryDto, RiskResponseDto, RiskStatus, TreatmentDecision, TreatRiskDto, UpdateRiskDto (+2 more)

### Community 2 - "Frontend Dependencies Config"
Cohesion: 0.05
Nodes (39): dependencies, autoprefixer, next, @next/swc-darwin-arm64, postcss, react, react-dom, recharts (+31 more)

### Community 3 - "Controls Backend Module"
Cohesion: 0.09
Nodes (3): ControlsController, ControlsModule, ControlsService

### Community 4 - "Compliance Backend Module"
Cohesion: 0.08
Nodes (3): ComplianceController, ComplianceModule, ComplianceService

### Community 5 - "Reports Backend Module"
Cohesion: 0.09
Nodes (3): ReportsController, ReportsModule, ReportsService

### Community 6 - "Auth Backend Module"
Cohesion: 0.12
Nodes (8): AuthController, AuthModule, AuthService, Public(), LoginDto, RefreshTokenDto, RegisterDto, TokenResponseDto

### Community 7 - "Backend Dev Config"
Cohesion: 0.07
Nodes (27): devDependencies, eslint, eslint-config-prettier, @eslint/eslintrc, @eslint/js, eslint-plugin-prettier, globals, jest (+19 more)

### Community 8 - "Risk UI Components"
Cohesion: 0.08
Nodes (24): RiskDetailDrawer(), categories, DEMO_RISK, regulations, RiskEditPage(), Action, actionStatusConfig, Control (+16 more)

### Community 9 - "UI Component Library"
Cohesion: 0.10
Nodes (21): Card(), CardBody(), CardBodyProps, CardHeader(), CardHeaderProps, CardProps, paddingClasses, DetailDrawer() (+13 more)

### Community 11 - "Root Package Config"
Cohesion: 0.08
Nodes (23): description, devDependencies, concurrently, name, private, scripts, build, build:backend (+15 more)

### Community 14 - "Deployment & Testing Infrastructure"
Cohesion: 0.11
Nodes (23): E2E Test Results (Auth + Risks), JwtStrategy.validate Bug (undefined role.name), NestJS Framework, Docker Backend Service (NestJS), Docker Compose Deployment Config, Docker Frontend Service (Next.js), Docker PostgreSQL Service, Next.js Framework (+15 more)

### Community 15 - "Backend TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 16 - "Frontend Type Definitions"
Cohesion: 0.09
Nodes (22): ActionSource, ActionStatus, ControlAutomation, ControlFrequency, ControlNature, ControlType, DashboardData, EffectivenessStatus (+14 more)

### Community 17 - "Shared Type Definitions"
Cohesion: 0.09
Nodes (21): ActionSource, ActionStatus, ControlAutomation, ControlFrequency, ControlNature, ControlType, DashboardData, EffectivenessStatus (+13 more)

### Community 18 - "Actions UI Page"
Cohesion: 0.11
Nodes (14): Action, BadgeVariant, sourceLabels, statusLabels, EXPECTED_COLUMNS, FREQUENCIES, GMY_LIST, ImportControlModalProps (+6 more)

### Community 19 - "Backend Runtime Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, bcrypt, class-transformer, class-validator, docx, @nestjs/common, @nestjs/config, @nestjs/core (+12 more)

### Community 20 - "Frontend TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 21 - "Risk Form Modal"
Cohesion: 0.13
Nodes (13): CATEGORIES, RiskFormModal(), RiskFormModalProps, RiskEntry, RiskManagementControl, SCORE_LABELS, Input(), InputProps (+5 more)

### Community 22 - "Auth Guards & Prisma Module"
Cohesion: 0.18
Nodes (6): JwtAuthGuard, PrismaModule, RiskEntryModule, RiskManagementControlsModule, RisksModule, AppModule

### Community 23 - "Service Dependency Injection"
Cohesion: 0.13
Nodes (3): PrismaService, JwtPayload, JwtStrategy

### Community 25 - "Backend Build Scripts"
Cohesion: 0.12
Nodes (17): scripts, build, db:setup, format, lint, prisma:generate, prisma:migrate, prisma:seed (+9 more)

### Community 26 - "Findings Detail UI"
Cohesion: 0.12
Nodes (12): Action, actionStatusConfig, Finding, sourceLabels, statusConfig, severityConfig, ActionFormData, AddActionModalProps (+4 more)

### Community 28 - "Actions Backend Module"
Cohesion: 0.22
Nodes (4): ActionsModule, CurrentUser, Roles(), RolesGuard

### Community 29 - "Control Agenda Kanban UI"
Cohesion: 0.14
Nodes (11): columnConfig, ControlCard, frequencyLabel, KanbanColumn, Control, EFFECTIVENESS_LABELS, Risk, RiskAssessmentPage() (+3 more)

### Community 30 - "Risks UI Components"
Cohesion: 0.16
Nodes (11): Risk, RiskDetailDrawerProps, Risk, Button(), ButtonProps, ButtonSize, ButtonVariant, sizeClasses (+3 more)

### Community 31 - "Auth & Controls UI"
Cohesion: 0.15
Nodes (12): useAuth(), automationLabel, BadgeVariant, ControlInventoryPage(), effectivenessLabel, frequencyLabel, natureLabel, statusLabel (+4 more)

### Community 32 - "Create Finding Modal"
Cohesion: 0.19
Nodes (11): Control, CreateFindingModal(), CreateFindingModalProps, findingTypeOptions, statusOptions, User, ControlTestingPage(), statusTranslation (+3 more)

### Community 34 - "API & Mapping Layer"
Cohesion: 0.15
Nodes (8): api, ApiOptions, Control, Risk, SEVERITY_COLORS, TYPE_LABELS, ComplianceOverview, Regulation

### Community 35 - "App Layout & Metadata"
Cohesion: 0.18
Nodes (9): inter, metadata, bgByType, iconByType, Toast, ToastContext, ToastContextType, ToastProvider() (+1 more)

### Community 36 - "Permission-Based UI"
Cohesion: 0.20
Nodes (11): PermissionGate(), RiskInventoryPage(), DEFAULT_ROLES, hasAllPermissions(), hasAnyPermission(), hasPermission(), Permission, PERMISSION_GROUPS (+3 more)

### Community 37 - "Audit Executions UI"
Cohesion: 0.17
Nodes (7): AuditExecution, BadgeVariant, DEMO_EXECUTIONS, statusLabels, Breadcrumb, PageHeader(), PageHeaderProps

### Community 38 - "Controls Detail UI"
Cohesion: 0.18
Nodes (11): Action, Control, effectivenessConfig, Finding, formatDate(), ControlDetailPage(), ControlTest, frequencyLabel (+3 more)

### Community 42 - "Risk Creation Pages"
Cohesion: 0.18
Nodes (9): EditAuditPlanPage(), User, Control, NewControlPage(), NewFindingPage(), NewRiskPage(), Risk, RiskCategory (+1 more)

### Community 43 - "Audit Plan Detail UI"
Cohesion: 0.20
Nodes (9): Finding, formatDate(), AuditPlanDetailPage(), DEMO_AUDIT, FINDING_STATUS_CONFIG, PHASE_CONFIG, PRIORITY_CONFIG, SEVERITY_CONFIG (+1 more)

### Community 44 - "Audit Plans UI"
Cohesion: 0.18
Nodes (8): AuditPlan, BadgeVariant, DELAY_CFG, DEMO_AUDITS, PHASE_CFG, PRIORITY_CFG, RATIONALE_LABEL, STATUS_CFG

### Community 45 - "Confirm Dialog Component"
Cohesion: 0.20
Nodes (9): ConfirmDialog(), ConfirmDialogProps, ConfirmVariant, confirmVariantMap, iconByVariant, Modal(), ModalProps, ModalSize (+1 more)

### Community 46 - "Backend Test Configuration"
Cohesion: 0.22
Nodes (9): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+1 more)

### Community 47 - "Dashboard Analytics UI"
Cohesion: 0.25
Nodes (8): COLORS, CONTROL_COLORS, DashboardData, DashboardPage(), getHeatmapColor(), HeatmapCell, PIE_COLORS, TrendData

### Community 48 - "Findings List UI"
Cohesion: 0.22
Nodes (6): BadgeVariant, delayStatusConfig, Finding, FindingsPage(), findingTypeConfig, statusConfig

### Community 50 - "Risk Entry Table UI"
Cohesion: 0.25
Nodes (5): COLUMN_GROUPS, COLUMNS, LEVEL_COLORS, RISK_DEPARTMENTS, RiskEntry

### Community 51 - "Compliance Mapping UI"
Cohesion: 0.25
Nodes (6): DEMO_CONTROLS, DEMO_MAPPINGS, DEMO_REGULATIONS, DEMO_RISKS, MappingItem, Regulation

### Community 53 - "Auth Context Provider"
Cohesion: 0.33
Nodes (5): AuthContext, AuthContextType, AuthProvider(), PUBLIC_ROUTES, User

### Community 54 - "Backend Package Metadata"
Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 55 - "Audit Plan Edit UI"
Cohesion: 0.29
Nodes (6): AUDIT_TEAMS, AUDITABLE_UNITS, DEMO_AUDIT, PHASE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS

### Community 56 - "Control Edit UI"
Cohesion: 0.29
Nodes (6): ControlEditPage(), DIRECTORATES, FREQUENCIES, GMY_LIST, MONTHS, User

### Community 57 - "EK6 Report UI"
Cohesion: 0.29
Nodes (5): currentYear, EK6ReportData, EK6Row, months, years

### Community 58 - "Action Detail UI"
Cohesion: 0.29
Nodes (5): Action, sourceLabels, statusConfig, DEMO_ACTION, priorityConfig

### Community 59 - "System Parameters UI"
Cohesion: 0.29
Nodes (5): categoryLabels, DEMO_OPTIONS, Parameter, RiskCategory, SystemOption

### Community 60 - "E2E Test Config"
Cohesion: 0.29
Nodes (6): moduleFileExtensions, rootDir, testEnvironment, testRegex, transform, ^.+\\.(t|j)s$

### Community 61 - "Risk Treatment UI"
Cohesion: 0.29
Nodes (5): Action, DEMO_RISKS, Risk, STATUS_COLORS, TREATMENT_OPTIONS

### Community 62 - "NestJS CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 63 - "Action Edit UI"
Cohesion: 0.33
Nodes (5): ActionEditPage(), DEMO_ACTION, priorityOptions, sourceOptions, statusOptions

### Community 64 - "Finding Edit UI"
Cohesion: 0.33
Nodes (5): Control, FindingEditPage(), findingTypeOptions, statusOptions, User

### Community 65 - "Risk Control Flow UI"
Cohesion: 0.33
Nodes (4): DEMO_FLOW, FlowItem, SEVERITY_COLORS, TYPE_CONFIG

### Community 66 - "New Audit Plan UI"
Cohesion: 0.33
Nodes (5): AUDIT_TEAMS, AUDITABLE_UNITS, NewAuditPlanPage(), PRIORITY_OPTIONS, RATIONALE_OPTIONS

### Community 67 - "New Control UI"
Cohesion: 0.33
Nodes (5): User, DIRECTORATES, FREQUENCIES, GMY_LIST, MONTHS

### Community 68 - "Integrations UI"
Cohesion: 0.33
Nodes (4): DEMO_INTEGRATIONS, Integration, STATUS_CONFIG, TYPE_CONFIG

### Community 69 - "Header & Search UI"
Cohesion: 0.33
Nodes (5): DEMO_SEARCH_DATA, Header(), SearchResult, TYPE_CONFIG, User

### Community 70 - "Public UI Assets"
Cohesion: 0.53
Nodes (6): Public Static UI Icon Assets, File Document Icon, Globe / World Wide Web Icon, Next.js Wordmark Logo, Vercel Triangle Logo, Browser / Desktop Window Icon

### Community 71 - "Role Management UI"
Cohesion: 0.33
Nodes (4): permissionCategories, Role, roleDescriptions, roleLabels

### Community 72 - "Shared Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 75 - "Risk-Controls Mapping UI"
Cohesion: 0.40
Nodes (3): ALL_CONTROLS, effectivenessConfig, Control

### Community 76 - "Action Effectiveness UI"
Cohesion: 0.40
Nodes (3): Action, COMPLETED_ACTIONS, effectivenessLabels

### Community 77 - "Database Seed Scripts"
Cohesion: 0.40
Nodes (3): adapter, pool, prisma

### Community 78 - "User Management UI"
Cohesion: 0.40
Nodes (3): Role, roleLabels, User

## Knowledge Gaps
- **513 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `name` (+508 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RisksService` connect `Risk Data Transfer Objects` to `Service Dependency Injection`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `RiskAssessmentPage()` connect `Control Agenda Kanban UI` to `Create Finding Modal`, `Risk Data Transfer Objects`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `Service Dependency Injection` to `Risk Data Transfer Objects`, `Controls Backend Module`, `Compliance Backend Module`, `Reports Backend Module`, `Auth Backend Module`, `Test Generation Controller`, `Admin Module Assembly`, `Risk Entry Backend Module`, `Auth Guards & Prisma Module`, `Audits Backend Module`, `Actions Backend Module`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _513 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend API Client Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.061057692307692306 - nodes in this community are weakly interconnected._
- **Should `Risk Data Transfer Objects` be split into smaller, more focused modules?**
  _Cohesion score 0.09413067552602436 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies Config` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._