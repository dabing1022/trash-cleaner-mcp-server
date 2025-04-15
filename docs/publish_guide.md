# npm 包发布操作指南

本指南适用于将 `@childhoodandy/trash-cleaner-mcp-server` 包发布到 npm。

---

## 1. 前置准备

- 已注册并登录 npm 账号（如未登录请先执行 `npm login`）。
- 已在 `package.json` 中正确设置包名、版本号、bin 字段等信息。
- 确认 `private` 字段为 `false`。

---

## 2. 一键发布命令

本项目已在 `package.json` 中配置了一键发布脚本。

只需在项目根目录下执行：

```sh
npm run release
```

即可自动将包发布到 npm，并设置为公开（public）。

---

## 3. 发布注意事项

- 首次发布或切换账号时，请先执行 `npm login`。
- 每次发布前请确保已更新 `version` 字段，否则 npm 会拒绝发布。
- 发布后可在 [npm 官网](https://www.npmjs.com/package/@childhoodandy/trash-cleaner-mcp-server) 查看包信息。
- 若使用了国内镜像源，发布后同步可能有延迟，建议用官方源测试。

---

## 4. 常见问题

- **403/权限错误**：请检查 npm 账号权限和组织设置。
- **版本号冲突**：每次发布需递增 `version` 字段。
- **404/找不到包**：请确认已发布成功，或等待镜像同步。

---

如有其他问题，请查阅 [npm 官方文档](https://docs.npmjs.com/) 或联系项目维护者。 