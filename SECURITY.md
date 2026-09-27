# Security

Please do not publish API keys, tokens, wallet secrets, private model files, or
personal datasets in issues or pull requests.

Report security issues privately to the repository maintainer. Include a clear
description, reproduction steps, affected version, and a safe contact method.

LocalRAGRemover stores API credentials in the operating system-backed Electron
safe storage when available. User settings and source files are kept outside
the repository and are excluded by `.gitignore`.
