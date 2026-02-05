!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

Var /GLOBAL BatchFile
Var /GLOBAL LegacyUninstallString

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
    
    ; 3. Check for and remove Legacy (Per-Machine) Installation using Registry
    ; We need to check both 32-bit and 64-bit registry views because we are a 32-bit installer 
    ; capable of removing a 64-bit app or vice-versa.
    
    StrCpy $LegacyUninstallString ""
    
    ; Check 64-bit Registry first (most likely for Electron apps)
    SetRegView 64
    ReadRegStr $LegacyUninstallString HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    SetRegView 32 ; Restore view
    
    ${If} $LegacyUninstallString == ""
        ; Check 32-bit Registry fallback
        ReadRegStr $LegacyUninstallString HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ${EndIf}
    
    ${If} $LegacyUninstallString != ""
        DetailPrint "Found legacy uninstaller in Registry: $LegacyUninstallString"
        
        ; The UninstallString usually includes quotes, e.g. "C:\Program Files\..." /allusers
        ; But we need to run it silently. 
        ; We will append /S to the command.
        ; Note: If the string is quoted, we need to be careful. 
        ; Usually simple execution works in batch file if we just prepend the line.
        
        FileWrite $0 "echo Found legacy uninstaller. Removing...$\r$\n"
        ; We use 'call' in batch to ensure it waits? No, uninstaller forks.
        ; Pass /S for silent.
        FileWrite $0 "$LegacyUninstallString /S$\r$\n"
    ${Else}
        DetailPrint "No legacy uninstaller found in Registry."
    ${EndIf}

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
