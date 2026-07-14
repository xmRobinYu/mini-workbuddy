# 后端包结构治理 - 全仓违规清单与落位矩阵

> 生成时间: 2026-05-15 01:20
> Story: US-002
> 用途: 指导 US-003 ~ US-015 的后续迁移

## 目录结构总览

目标结构规则：`com.ccb.skillhub.<module>.<role>`（模块 + 职责两层）

- 禁止的固定中间层：`app`、`api`、`biz`、`mybatis`、`jpa`
- 禁止的并行目录：`vo`
- 允许的 `common` 子目录：`exception`、`util`、`constants`、`enums`
- 命名后缀规则：
  - `service` 下类名必须以 `Service` 结尾
  - `dao` 下类名必须以 `Dao` 结尾
  - `dto` 下类名必须以 `Dto` 结尾
  - `controller` 下类名必须以 `Controller` 结尾
  - `listener` 下类名必须以 `Listener` 结尾
  - `event` 下类名必须以 `Event` 结尾
  - `task` 下类名必须以 `Task` 结尾
  - `config` 下类名必须以 `Config` 或 `Properties` 结尾

---

## 1. 目录违规清单

### 1.1 skillhub-app

| 违规类型 | 数量 | 归属 Story |
|----------|------|------------|
| protocol.biz 残留 | 4 | US-003 |
| vo 目录 | 47 | US-004 |
| 命名违规 | 3 | US-005 |

### 1.2 skillhub-storage

| 违规类型 | 数量 | 归属 Story |
|----------|------|------------|
| api/biz 中间层 | 7 | US-006 |

### 1.3 skillhub-search

| 违规类型 | 数量 | 归属 Story |
|----------|------|------------|
| mysql/localfile 技术层 | 6 | US-007 |

### 1.4 skillhub-auth

| 违规类型 | 数量 | 归属 Story |
|----------|------|------------|
| biz 主体 | 71 | US-008 |

### 1.5 skillhub-service

| 违规类型 | 数量 | 归属 Story |
|----------|------|------------|
| api 层 | 113 | US-009 |
| biz 主体（不含 mybatis） | 118 | US-010 |
| biz.mybatis 技术层 | 87 | US-011 |

---

## 2. 命名违规清单

规则：职责目录下的类名必须符合后缀规则。

- config: com/ccb/skillhub/auth/biz/uass/config/UassStateStoreConfiguration.java (当前: UassStateStoreConfiguration, 期望: *Config 或 *Properties)
- config: com/ccb/skillhub/auth/config/BrowserAuthConfiguration.java (当前: BrowserAuthConfiguration, 期望: *Config 或 *Properties)
- config: com/ccb/skillhub/system/config/SessionCookieConfiguration.java (当前: SessionCookieConfiguration, 期望: *Config 或 *Properties)
- controller: com/ccb/skillhub/system/controller/GlobalExceptionHandler.java (当前: GlobalExceptionHandler, 期望: *Controller)
- dto: com/ccb/skillhub/auth/api/dto/AuthMeResponse.java (当前: AuthMeResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/AuthMethodResponse.java (当前: AuthMethodResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/BrowserLoginResponse.java (当前: BrowserLoginResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/CasLoginResponse.java (当前: CasLoginResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/CliWhoamiResponse.java (当前: CliWhoamiResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/TokenCreateResponse.java (当前: TokenCreateResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/TokenSummaryResponse.java (当前: TokenSummaryResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/UassLoginStatusResponse.java (当前: UassLoginStatusResponse, 期望: *Dto)
- dto: com/ccb/skillhub/auth/api/dto/UassLoginUrlResponse.java (当前: UassLoginUrlResponse, 期望: *Dto)
- dto: com/ccb/skillhub/common/api/dto/MessageResponse.java (当前: MessageResponse, 期望: *Dto)
- dto: com/ccb/skillhub/common/api/dto/PageResponse.java (当前: PageResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/AdminSkillMutationResponse.java (当前: AdminSkillMutationResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/AdminSkillReportSummaryResponse.java (当前: AdminSkillReportSummaryResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/GovernanceActivityItemResponse.java (当前: GovernanceActivityItemResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/GovernanceInboxItemResponse.java (当前: GovernanceInboxItemResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/GovernanceSummaryResponse.java (当前: GovernanceSummaryResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/ReviewSkillDetailResponse.java (当前: ReviewSkillDetailResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/ReviewTaskResponse.java (当前: ReviewTaskResponse, 期望: *Dto)
- dto: com/ccb/skillhub/governance/api/dto/SkillReportMutationResponse.java (当前: SkillReportMutationResponse, 期望: *Dto)
- dto: com/ccb/skillhub/label/api/dto/LabelDefinitionResponse.java (当前: LabelDefinitionResponse, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/BatchMemberResponse.java (当前: BatchMemberResponse, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/BatchMemberResult.java (当前: BatchMemberResult, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/MemberResponse.java (当前: MemberResponse, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/MyNamespaceResponse.java (当前: MyNamespaceResponse, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/NamespaceCandidateUserResponse.java (当前: NamespaceCandidateUserResponse, 期望: *Dto)
- dto: com/ccb/skillhub/namespace/api/dto/NamespaceResponse.java (当前: NamespaceResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/PublishResponse.java (当前: PublishResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/ResolveVersionResponse.java (当前: ResolveVersionResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillCheckResponse.java (当前: SkillCheckResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillDeleteResponse.java (当前: SkillDeleteResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillDetailResponse.java (当前: SkillDetailResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillFileResponse.java (当前: SkillFileResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillLifecycleMutationResponse.java (当前: SkillLifecycleMutationResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillLifecycleVersionResponse.java (当前: SkillLifecycleVersionResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillRatingStatusResponse.java (当前: SkillRatingStatusResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillSummaryResponse.java (当前: SkillSummaryResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillVersionDetailResponse.java (当前: SkillVersionDetailResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/SkillVersionResponse.java (当前: SkillVersionResponse, 期望: *Dto)
- dto: com/ccb/skillhub/skill/api/dto/TagResponse.java (当前: TagResponse, 期望: *Dto)
- dto: com/ccb/skillhub/storage/api/dto/ObjectMetadata.java (当前: ObjectMetadata, 期望: *Dto)
- dto: com/ccb/skillhub/system/api/dto/AuditLogItemResponse.java (当前: AuditLogItemResponse, 期望: *Dto)
- dto: com/ccb/skillhub/system/api/dto/NotificationResponse.java (当前: NotificationResponse, 期望: *Dto)
- dto: com/ccb/skillhub/system/api/dto/SecurityAuditResponse.java (当前: SecurityAuditResponse, 期望: *Dto)
- dto: com/ccb/skillhub/user/api/dto/AdminUserMutationResponse.java (当前: AdminUserMutationResponse, 期望: *Dto)
- dto: com/ccb/skillhub/user/api/dto/AdminUserSummaryResponse.java (当前: AdminUserSummaryResponse, 期望: *Dto)
- dto: com/ccb/skillhub/user/api/dto/FieldPolicyResponse.java (当前: FieldPolicyResponse, 期望: *Dto)
- dto: com/ccb/skillhub/user/api/dto/UserProfileResponse.java (当前: UserProfileResponse, 期望: *Dto)
- event: com/ccb/skillhub/search/event/SearchIndexEventListener.java (当前: SearchIndexEventListener, 期望: *Event)
- listener: com/ccb/skillhub/skill/listener/RecipientResolver.java (当前: RecipientResolver, 期望: *Listener)

**归属 Story：** US-005（skillhub-app 内）、US-012（全仓命名后缀治理）

---

## 3. 实体类与字段注释清单

规则：所有实体类字段都必须补充中文注释。

- com/ccb/uass/client/bs/entity/Principal.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillVersionStatsRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillStarRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillVersionRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillRatingRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillTagRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillLabelRecord.java
- com/ccb/skillhub/skill/biz/mybatis/entity/SkillFileRecord.java
- com/ccb/skillhub/user/biz/profile/mybatis/entity/UserInfoRecord.java
- com/ccb/skillhub/system/biz/audit/mybatis/entity/AuditLogRecord.java
- com/ccb/skillhub/system/biz/idempotency/mybatis/entity/IdempotencyRecordRow.java
- com/ccb/skillhub/system/biz/storagecompensation/mybatis/entity/SkillStorageDeletionCompensationRecord.java
- com/ccb/skillhub/system/biz/securityaudit/mybatis/entity/SecurityAuditRecord.java
- com/ccb/skillhub/search/biz/mybatis/entity/SkillSearchDocumentRecord.java
- com/ccb/skillhub/namespace/biz/mybatis/entity/NamespaceMemberRecord.java
- com/ccb/skillhub/namespace/biz/mybatis/entity/NamespaceRecord.java
- com/ccb/skillhub/label/biz/mybatis/entity/LabelDefinitionRecord.java
- com/ccb/skillhub/auth/biz/rbac/mybatis/entity/UserRolePermissionBindingRecord.java
- com/ccb/skillhub/auth/biz/rbac/mybatis/entity/RoleRecord.java
- com/ccb/skillhub/auth/biz/rbac/mybatis/entity/UserRoleBindingRecord.java
- com/ccb/skillhub/auth/biz/rbac/mybatis/entity/PermissionRecord.java
- com/ccb/skillhub/auth/biz/apitoken/mybatis/entity/ApiTokenRecord.java
- com/ccb/skillhub/governance/biz/mybatis/entity/GovernancePromotionRow.java
- com/ccb/skillhub/governance/biz/mybatis/entity/GovernanceReviewTaskRow.java
- com/ccb/skillhub/governance/biz/mybatis/entity/GovernanceProjectionRow.java
- com/ccb/skillhub/governance/biz/mybatis/entity/GovernanceReportRow.java
- com/ccb/skillhub/governance/biz/mybatis/entity/ReviewTaskRecord.java
- com/ccb/skillhub/governance/biz/mybatis/entity/SkillReportRecord.java
- com/ccb/skillhub/governance/biz/mybatis/entity/PromotionRequestRecord.java
- com/ccb/skillhub/governance/biz/mybatis/entity/AdminSkillReportSummaryRow.java

实体类总数: 31
疑似缺少中文注释: 31

**归属 Story：** US-013

---

## 4. 核心类与核心方法注释清单

规则：核心控制器、核心服务类和关键方法必须具备中文注释。

### 4.1 核心控制器（skillhub-app controller 目录）

- com/ccb/skillhub/system/controller/BaseApiController.java
- com/ccb/skillhub/system/controller/SecurityAuditController.java
- com/ccb/skillhub/protocol/wellknown/controller/WellKnownController.java
- com/ccb/skillhub/protocol/clawhub/controller/ClawHubCompatController.java
- com/ccb/skillhub/governance/controller/portal/SkillReportController.java

### 4.2 核心服务类（skillhub-app service 目录）

- com/ccb/skillhub/system/service/AdminAuditLogAppService.java
- com/ccb/skillhub/label/service/PublicLabelAppService.java
- com/ccb/skillhub/label/service/LabelSearchSyncService.java
- com/ccb/skillhub/label/service/LabelAdminAppService.java
- com/ccb/skillhub/auth/service/AuthMethodCatalogService.java
- com/ccb/skillhub/auth/service/BrowserLoginTokenService.java
- com/ccb/skillhub/auth/service/BrowserLogoutService.java
- com/ccb/skillhub/governance/service/GovernanceWorkflowAppService.java

### 4.3 核心服务类（skillhub-auth *Service.java）

- com/ccb/skillhub/auth/biz/rbac/RbacService.java
- com/ccb/skillhub/auth/biz/uass/UassUserResolutionService.java
- com/ccb/skillhub/auth/biz/uass/UassBootstrapAdminRoleService.java
- com/ccb/skillhub/auth/biz/uass/UassSessionContextService.java
- com/ccb/skillhub/auth/biz/apitoken/ApiTokenScopeService.java

### 4.4 核心服务类（skillhub-service *Service.java）

- com/ccb/skillhub/skill/biz/delete/SkillHardDeleteService.java
- com/ccb/skillhub/skill/biz/lifecycle/SkillLifecycleProjectionService.java
- com/ccb/skillhub/skill/biz/storagedeletion/SkillStorageDeletionCompensationService.java
- com/ccb/skillhub/system/biz/audit/AuditLogService.java
- com/ccb/skillhub/system/biz/audit/AuditLogQueryService.java
- com/ccb/skillhub/system/biz/securityaudit/scanner/SkillScannerService.java
- com/ccb/skillhub/system/biz/securityaudit/SecurityScanService.java
- com/ccb/skillhub/search/AbstractJpaSearchIndexService.java
- com/ccb/skillhub/search/SearchQueryService.java
- com/ccb/skillhub/search/AbstractJpaSearchRebuildService.java
- com/ccb/skillhub/search/HashingSearchEmbeddingService.java
- com/ccb/skillhub/search/SearchRebuildService.java
- com/ccb/skillhub/search/SearchEmbeddingService.java
- com/ccb/skillhub/search/SearchIndexService.java
- com/ccb/skillhub/namespace/biz/member/GlobalNamespaceMembershipService.java

**归属 Story：** US-014

---

## 5. 落位矩阵

落位规则：`com.ccb.skillhub.<module>.<role>`

| 当前位置 | 目标位置 | Story | 备注 |
|----------|----------|-------|------|
| `skillhub-app/protocol/biz/*` | `skillhub-app/protocol/support/*` | US-003 | 协议适配 support |
| `skillhub-app/**/vo/*` | `skillhub-app/**/dto/*` | US-004 | vo → dto |
| `skillhub-app/system/controller/GlobalExceptionHandler` | 需重命名 | US-005 | controller 下非 Controller 后缀 |
| `skillhub-app/skill/listener/RecipientResolver` | 需重命名 | US-005 | listener 下非 Listener 后缀 |
| `skillhub-app/system/config/SessionCookieConfiguration` | 需重命名 | US-005 | config 下非 Config/Properties 后缀 |
| `skillhub-storage/api/dto/ObjectMetadata` | `skillhub-storage/dto/ObjectMetadataDto` | US-006 | dto 归位 + 重命名 |
| `skillhub-storage/api/service/ObjectStorageService` | `skillhub-storage/service/ObjectStorageService` | US-006 | service 归位 |
| `skillhub-storage/api/exception/StorageAccessException` | `skillhub-storage/common.exception/StorageAccessException` | US-006 | exception 归位 |
| `skillhub-storage/biz/config/*` | `skillhub-storage/config/*` | US-006 | config 归位 |
| `skillhub-storage/biz/provider/*` | `skillhub-storage/service/*` 或保留 | US-006 | provider 归 service |
| `skillhub-search/mysql/*` | `skillhub-service/search/dao/*` | US-007 | mysql-like 迁 service |
| `skillhub-search/localfile/*` | `skillhub-search/service/*` | US-007 | localfile 扁平化 |
| `skillhub-search/event/*` | 保持 `skillhub-search/event/*` | US-007 | event 独立职责，合法 |
| `skillhub-auth/biz/*` | `skillhub-auth/service/*` / `skillhub-auth/dto/*` / ... | US-008 | biz 主体扁平化 |
| `skillhub-service/**/api/dao/*` | `skillhub-service/**/dao/*` | US-009 | api 层扁平化 |
| `skillhub-service/**/api/dto/*` | `skillhub-service/**/dto/*` | US-009 | dto 归位，重命名 *Dto |
| `skillhub-service/**/biz/service/*` | `skillhub-service/**/service/*` | US-010 | service 归位 |
| `skillhub-service/**/biz/event/*` | `skillhub-service/**/event/*` | US-010 | event 归位 |
| `skillhub-service/**/biz/model/*` | `skillhub-service/**/entity/*` | US-010 | model → entity |
| `skillhub-service/**/biz/exception/*` | `skillhub-service/**/common.exception/*` | US-010 | exception 归位 |
| `skillhub-service/**/biz/*Service` | `skillhub-service/**/service/*Service` | US-010 | service 归位 |
| `skillhub-service/**/biz/mybatis/dao/*` | `skillhub-service/**/dao/*` | US-011 | mybatis 层折叠 |
| `skillhub-service/**/biz/mybatis/entity/*` | `skillhub-service/**/entity/*` | US-011 | entity 归位 |
| `skillhub-service/**/biz/mybatis/mapper/*` | `skillhub-service/**/dao/*` | US-011 | mapper 合并到 dao |

---

## 6. 统计摘要

| 指标 | 数量 |
|------|------|
| 总生产 Java 类 | 597 |
| 目录违规类总数 | 456 |
| skillhub-app 违规 | 54 |
| skillhub-storage 违规 | 7 |
| skillhub-search 违规 | 6 |
| skillhub-auth 违规 | 71 |
| skillhub-service 违规 | 318 |
| 实体类总数 | 31 |
| 疑似缺中文注释实体 | 31 |

---

## 验证结论

- [x] 每个模块都有完整违规清单
- [x] 不存在'未归属故事'的违规类（所有违规已映射到 US-003 ~ US-015）
- [x] 输出落位矩阵可直接用于后续故事执行
- [x] Typecheck passes（本 story 未修改生产代码，仅生成分析文档）

