#define MyAppName "Clawvio"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Clawvio"
#define MyAppExeName "local-stt.exe"

[Setup]
AppId={{A4D7E43E-94D2-49A1-90B0-1EC15AF2CC72}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Clawvio
DefaultGroupName=Clawvio
AllowNoIcons=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir=..\dist\installer
OutputBaseFilename=ClawvioSetup
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "startup"; Description: "Launch Clawvio when I sign in"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "..\dist\local-stt.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist
Source: "..\assets\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Clawvio"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall Clawvio"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Clawvio"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\icon.ico"
Name: "{userstartup}\Clawvio"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Clawvio"; Flags: nowait postinstall skipifsilent
