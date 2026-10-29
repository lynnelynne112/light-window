Option Explicit
Dim fso, shell, basePath, exePath, args, item, exitCode
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
basePath = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = fso.BuildPath(basePath, "electron.exe")
If Not fso.FileExists(exePath) Then
  MsgBox "Please extract the complete LightWindow folder first.", 48, "LightWindow"
  WScript.Quit 1
End If
args = ""
For Each item In WScript.Arguments
  If item = "--self-test" Or item = "--verify-restart" Or item = "--live-check" Then args = args & " " & item
Next
shell.CurrentDirectory = basePath
exitCode = shell.Run(Chr(34) & exePath & Chr(34) & args, 0, (Len(args) > 0))
WScript.Quit exitCode
