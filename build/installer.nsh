RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

Var /GLOBAL PreviousVersion

!include "WordFunc.nsh"
!insertmacro VersionCompare

!macro customInit
  ; -----------------------------------------------------------
  ; Step 1: Detect Installed Version (Before Install)
  ; -----------------------------------------------------------
  ; We must do this here because by the time customInstall runs, 
  ; the installer has already written the new version to the registry.
  
  StrCpy $PreviousVersion "0.0.0"
  
  ; Check HKLM (Legacy detection)
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  SetRegView 32
  ${If} $0 == ""
      ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  ${EndIf}
  
  ${If} $0 != ""
      StrCpy $PreviousVersion $0
      ; We can't write to main log here comfortably as it opens in customInstall, 
      ; but we could debug print if needed.
  ${Else}
      ; Check HKCU (Modern detection)
      ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
      ${If} $0 != ""
          StrCpy $PreviousVersion $0
      ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; Define log path
  StrCpy $0 "$TEMP\attentive_migration.log"
  FileOpen $9 $0 w
  FileWrite $9 "--- Starting Migration Log ---$\r$\n"
  FileWrite $9 "Product Name: ${PRODUCT_NAME}$\r$\n"

  FileWrite $9 "Pre-Install Detected Version: $PreviousVersion$\r$\n"

  ; -----------------------------------------------------------
  ; Step 2: Compare Version
  ; -----------------------------------------------------------
  ; Compare Previous Version ($PreviousVersion) with "1.0.10"
  ; Result in $1: 0=Equal, 1=Installed is Newer, 2=Installed is Older
  ${VersionCompare} "$PreviousVersion" "1.0.10" $1
  
  FileWrite $9 "Version Comparison: Detected=$PreviousVersion vs Target=1.0.10. Result=$1$\r$\n"

  ; -----------------------------------------------------------
  ; Step 3: Conditional Logic
  ; -----------------------------------------------------------
  
  ${If} $1 == 1
    ; Installed Version > 1.0.10
    ; Firewall rules are assumed to be in place (per-user). No need for elevation.
    DetailPrint "Previous version ($PreviousVersion) is up to date. Skipping firewall configuration."
    FileWrite $9 "Action: Skip (Version > 1.0.10).$\r$\n"
    
  ${Else}
    ; Installed Version <= 1.0.10 (Legacy) OR "0.0.0" (Clean Install)
    ; We need to ADD firewall rules (Requires Elevation).
    ; If it's a legacy upgrade, we also need to run the legacy uninstaller.

    DetailPrint "Legacy or Clean Install detected ($PreviousVersion). Configuring Firewall..."
    FileWrite $9 "Action: Elevate (Version <= 1.0.10).$\r$\n"

    ; Define paths
    StrCpy $BatchFile "$TEMP\attentive_setup_helper.bat"
    
    ; Create a batch file to run elevated commands
    FileOpen $2 $BatchFile w
    FileWrite $2 "@echo off$\r$\n"
    FileWrite $2 "echo Configuring Windows Firewall... >> $TEMP\attentive_migration.log$\r$\n"
    
    ; A. Firewall Rules (Always needed for this branch)
    ; ------------------------------------------------
    ; 1. Remove old rules to be safe (cleanup)
    FileWrite $2 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\" >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    ; 2. Add new firewall rules for the NEW location ($INSTDIR)
    FileWrite $2 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=in action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    FileWrite $2 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=out action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    ; B. Legacy Uninstaller (Only if found in HKLM)
    ; ---------------------------------------------
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
        
        FileWrite $2 "echo Found legacy uninstaller: $R1 >> $TEMP\attentive_migration.log$\r$\n"
        FileWrite $2 "echo Running uninstaller... >> $TEMP\attentive_migration.log$\r$\n"
        
        ; Run uninstaller silently
        FileWrite $2 "$R1 /S >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    ${Else}
        FileWrite $9 "No legacy uninstaller found (Clean Install or already removed).$\r$\n"
    ${EndIf}
    
    FileClose $2
    FileClose $9 ; Close log before batch execution

    ; Execute the batch file as ADMIN (Trigger UAC) and WAIT
    ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
    
    ; Re-open log to record completion
    FileOpen $9 "$TEMP\attentive_migration.log" a
    FileSeek $9 0 END
    FileWrite $9 "Elevated batch process finished.$\r$\n"
    
  ${EndIf}
  FileClose $9
!macroend

!macro customUninstall
  ; On uninstall, we should try to clean up firewall rules
  
  StrCpy $BatchFile "$TEMP\attentive_uninstall_helper.bat"
  FileOpen $0 $BatchFile w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\"$\r$\n"
  FileClose $0
  
  ; ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $\"$BatchFile$\" -Verb RunAs -Wait"'
  
  ; DeleteRegValue HKCU "Software\${PRODUCT_NAME}" "FirewallConfigured"
!macroend

Function .onInstSuccess
  ; Check if we are running as an update (silent)
  ${If} ${Silent}
    ; If silent, we want to auto-launch the app because quitAndInstall was called.
    ; Electron-builder usually handles this via RequestExecutionLevel user, but sometimes we need to force it.
    Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
  ${EndIf}
FunctionEnd
