# Security Policy

## Supported versions

`0.1.x` 目前处于 Beta 阶段。安全修复优先合入最新的 `main` 分支，暂不为旧版本提供长期维护。

## Reporting a vulnerability

请不要通过公开 Issue 报告可被利用的漏洞、真实凭证或内部数据。请使用 GitHub 仓库的 **Security → Report a vulnerability** 私密报告，并提供：

- 受影响版本与组件；
- 最小可复现步骤；
- 影响范围与建议修复方向；
- 已经采取的降低风险措施。

不要在报告中放入仍然有效的 API Key、密码、Token、客户资料或业务文件。如果发现真实凭证泄漏，请先立即撤销或轮换凭证。

## Deployment responsibility

运行者需要自行完成网络边界、TLS、身份管理、病毒扫描、备份恢复、日志保护和所使用 AI Provider 的数据合规评审。
