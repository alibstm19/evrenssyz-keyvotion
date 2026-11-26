Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell -ExecutionPolicy Bypass -File """ & Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "launch.ps1""", 0, False
