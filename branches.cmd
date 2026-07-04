@echo off
rem One-word launcher for the branch dev-server status board.
rem .cmd is not governed by PowerShell's AllSigned policy, so this always runs.
node "%~dp0tools\branch-status.mjs" %*
