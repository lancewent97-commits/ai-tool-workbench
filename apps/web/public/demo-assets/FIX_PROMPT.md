# 回传包修正要求

请先读取自动检查结果和平台生产标准，然后：

1. 补齐 CHANGELOG.md，说明来源版本、修改原因和变化；
2. 在 tool-manifest.json 中记录 sourceToolId 与 sourceVersion；
3. 在 README.md 和 AGENT_INSTRUCTIONS.md 中声明允许配置、适配、替换和禁止修改的边界；
4. 不要把业务结果、密钥、Token、客户数据和运行日志放入回传包；
5. 完成后生成新的 `return-package-fixed.zip`，并附完成报告。

先向用户说明你的修正计划并等待确认，完成后再请用户上传平台复查。
