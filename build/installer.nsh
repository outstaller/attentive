!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

Var /GLOBAL BatchFile

!macro customInstall
  ; Define log path
  StrCpy $0 "$TEMP\attentive_migration.log"
  FileOpen $9 $0 w
  FileWrite $9 "--- Starting Migration Log ---$\r$\n"
  FileWrite $9 "Product Name: ${PRODUCT_NAME}$\r$\n"
  FileWrite $9 "Checking Registry Key: HKCU\Software\${PRODUCT_NAME}\FirewallConfigured$\r$\n"

  ; Check if we have already configured the firewall/migrated
  ReadRegStr $0 HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured"
  FileWrite $9 "Registry Read Result: '$0'$\r$\n"
  
  ${If} $0 == ""
    
    DetailPrint "First time install/update to per-user. Configuring Firewall & Migrating..."
    FileWrite $9 "Status: Flag missing. Proceeding with migration.$\r$\n"
    
    ; Define paths
    StrCpy $BatchFile "$TEMP\attentive_setup_helper.bat"
    
    ; Create a batch file to run elevated commands
    FileOpen $0 $BatchFile w
    FileWrite $0 "@echo off$\r$\n"
    FileWrite $0 "echo Configuring Windows Firewall and checking legacy uninstall... >> $TEMP\attentive_migration.log$\r$\n"
    
    ; 1. Remove old firewall rules (cleanup)
    FileWrite $0 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\" >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    ; 2. Add new firewall rules for the NEW location ($INSTDIR)
    FileWrite $0 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=in action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    FileWrite $0 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=out action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    ; 3. Check for and remove Legacy (Per-Machine) Installation using Registry
    
    StrCpy $R1 ""
    
    ; Check 64-bit Registry first
    SetRegView 64
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    SetRegView 32 ; Restore view
    
    ${If} $R1 == ""
        ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ${EndIf}
    
    ${If} $R1 != ""
        DetailPrint "Found legacy uninstaller: $R1"
        FileWrite $9 "Found legacy uninstaller: $R1$\r$\n"
        
        FileWrite $0 "echo Found legacy uninstaller: $R1 >> $TEMP\attentive_migration.log$\r$\n"
        FileWrite $0 "echo Running uninstaller... >> $TEMP\attentive_migration.log$\r$\n"
        
        FileWrite $0 "$R1 /S >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    ${Else}
        DetailPrint "No legacy uninstaller found in Registry."
        FileWrite $9 "No legacy uninstaller found in Registry.$\r$\n"
        FileWrite $0 "echo No legacy uninstaller found in Registry. >> $TEMP\attentive_migration.log$\r$\n"
    ${EndIf}
    
    FileClose $0
    FileClose $9 ; Close main log before batch appends to it

    ; Execute the batch file as ADMIN (Trigger UAC) and WAIT
    ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
    
    ; Mark as configured so we don't ask again
    WriteRegStr HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured" "true"
    FileWrite $9 "Registry Key Written: HKCU\Software\${PRODUCT_NAME}\FirewallConfigured = true$\r$\n"
    
  ${Else}
    DetailPrint "Firewall already configured. Skipping elevation."
    FileWrite $9 "Status: FirewallConfigured flag present. Skipping migration.$\r$\n"
    FileClose $9
  ${EndIf}
!macroend

!macro customUninstall
  ; On uninstall, we should try to clean up firewall rules
  
  StrCpy $BatchFile "$TEMP\attentive_uninstall_helper.bat"
  FileOpen $0 $BatchFile w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\"$\r$\n"
  FileClose $0
  
  ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
  
  DeleteRegValue HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured"
!macroend
