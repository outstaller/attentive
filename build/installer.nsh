!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

Var /GLOBAL BatchFile

!macro customInstall
  ; Check if we have already configured the firewall/migrated
  ReadRegStr $0 HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured"
  ${If} $0 == ""
    
    DetailPrint "First time install/update to per-user. Configuring Firewall & Migrating..."
    
    ; Define paths
    StrCpy $BatchFile "$TEMP\attentive_setup_helper.bat"
    
    ; Create a batch file to run elevated commands
    FileOpen $0 $BatchFile w
    FileWrite $0 "@echo off$\r$\n"
    FileWrite $0 "echo Configuring Windows Firewall for ${PRODUCT_NAME}...$\r$\n"
    
    ; 1. Remove old firewall rules (cleanup)
    FileWrite $0 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\"$\r$\n"
    
    ; 2. Add new firewall rules for the NEW location ($INSTDIR)
    FileWrite $0 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=in action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes$\r$\n"
    FileWrite $0 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=out action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes$\r$\n"
    
    ; 3. Check for and remove Legacy (Per-Machine) Installation
    ; Common location: C:\Program Files\Attentive Student\Uninstall.exe
    ; We'll try a few standard locations or just attempt the uninstall command if file exists.
    ; NOTE: We are generating a batch file, so we can use IF EXIST checks in batch language.
    
    ; Legacy Path 1: Program Files
    FileWrite $0 "if exist $\"$PROGRAMFILES\${PRODUCT_NAME}\Uninstall.exe$\" ($\r$\n"
    FileWrite $0 "  echo Found legacy installation in Program Files. Removing...$\r$\n"
    FileWrite $0 "  $\"$PROGRAMFILES\${PRODUCT_NAME}\Uninstall.exe$\" /S$\r$\n"
    FileWrite $0 ")$\r$\n"

    ; Legacy Path 2: Program Files (x86) - just in case
    FileWrite $0 "if exist $\"$PROGRAMFILES32\${PRODUCT_NAME}\Uninstall.exe$\" ($\r$\n"
    FileWrite $0 "  echo Found legacy installation in Program Files (x86). Removing...$\r$\n"
    FileWrite $0 "  $\"$PROGRAMFILES32\${PRODUCT_NAME}\Uninstall.exe$\" /S$\r$\n"
    FileWrite $0 ")$\r$\n"

    ; Legacy Path 3: Program Files (64-bit) - likely the issue
    FileWrite $0 "if exist $\"$PROGRAMFILES64\${PRODUCT_NAME}\Uninstall.exe$\" ($\r$\n"
    FileWrite $0 "  echo Found legacy installation in Program Files (64-bit). Removing...$\r$\n"
    FileWrite $0 "  $\"$PROGRAMFILES64\${PRODUCT_NAME}\Uninstall.exe$\" /S$\r$\n"
    FileWrite $0 ")$\r$\n"
    
    FileClose $0

    ; Execute the batch file as ADMIN (Trigger UAC) and WAIT for it to finish.
    ; We use PowerShell Start-Process with -Verb RunAs and -Wait to handle the elevation and waiting.
    ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
    
    ; Mark as configured so we don't ask again
    WriteRegStr HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured" "true"
    
  ${Else}
    DetailPrint "Firewall already configured. Skipping elevation."
  ${EndIf}
!macroend

!macro customUninstall
  ; On uninstall, we should try to clean up firewall rules
  ; This WILL trigger UAC if we do it. 
  ; Since we are per-user now, standard uninstall is silent.
  ; If we want to be clean, we must ask for permission.
  
  StrCpy $BatchFile "$TEMP\attentive_uninstall_helper.bat"
  FileOpen $0 $BatchFile w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\"$\r$\n"
  FileClose $0
  
  ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
  
  DeleteRegValue HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured"
!macroend
