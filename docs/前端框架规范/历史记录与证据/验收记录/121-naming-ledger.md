# Aoo 全项目命名违规台账

- 生成时间：2026-08-26T04:14:02.226Z
- 精确基线数量：4470
- 清单哈希：`4291ae92eae5c4eeaa455073e5f2ee86cd103ecc74a2bdfb508d097fb52100a5`
- 负责人：Aoo migration team
- 清理期限：2026-12-31
- 机器清单：[121-naming-inventory.json](./121-naming-inventory.json)
- 明确排除：用户私有备份 `Client/assets/Lobby/Prefab/uiGame-001/**`，不扫描、不计数、不改动。

## 规则

当前清单是逐文件、逐问题的迁移基线，不是通配目录豁免。新增任何命名偏差会立即失败；删除或改正旧条目允许通过。历史协议类、Creator 2.2.2 序列化资源和第三方 Admin 组件不得机械改名，必须分别通过协议版本迁移、Creator AssetDB 保 UUID 重命名和调用方迁移退出本清单。

## 分类统计

| 分类 | 数量 |
|---|---:|
| Admin/typescript-file-name | 12 |
| Admin/vue-component-name | 118 |
| Client/asset-directory | 1365 |
| Client/creator-asset-name | 519 |
| Client/creator-placeholder-node | 215 |
| Client/static-asset-name | 1520 |
| Client/typescript-export-name | 24 |
| Server/java-class-file | 697 |

## 验证命令

`node scripts/verify-naming-conventions.mjs`
