RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

Var /GLOBAL BatchFile
!ifndef BUILD_UNINSTALLER
  Var /GLOBAL PreviousVersion
  Var /GLOBAL LegacyInstallDir
!endif

!include "WordFunc.nsh"
!insertmacro VersionCompare

!macro customInit
  ; -----------------------------------------------------------
  ; Step 1: Detect Installed Version & Location (Before Install)
  ; -----------------------------------------------------------
  
  StrCpy $PreviousVersion "0.0.0"
  StrCpy $LegacyInstallDir ""
  
  ; Check HKLM (Legacy detection)
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  SetRegView 32
  ${If} $0 == ""
      ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
      ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${EndIf}
  
  ${If} $0 != ""
      StrCpy $PreviousVersion $0
      StrCpy $LegacyInstallDir $1
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
  FileWrite $9 "Legacy Install Dir: $LegacyInstallDir$\r$\n"

  ; -----------------------------------------------------------
  ; Step 2: Compare Version
  ; -----------------------------------------------------------
  ${VersionCompare} "$PreviousVersion" "1.0.10" $1
  
  FileWrite $9 "Version Comparison: Detected=$PreviousVersion vs Target=1.0.10. Result=$1$\r$\n"

  ; -----------------------------------------------------------
  ; Step 3: Conditional Logic
  ; -----------------------------------------------------------
  
  ${If} $1 == 1
    ; Installed Version > 1.0.10
    DetailPrint "Previous version ($PreviousVersion) is up to date. Skipping firewall configuration."
    FileWrite $9 "Action: Skip (Version > 1.0.10).$\r$\n"
    
  ${Else}
    ; Installed Version <= 1.0.10 (Legacy) OR "0.0.0" (Clean Install)
    DetailPrint "Legacy or Clean Install detected ($PreviousVersion). Configuring Firewall..."
    FileWrite $9 "Action: Elevate (Version <= 1.0.10).$\r$\n"

    ; Define paths
    StrCpy $BatchFile "$TEMP\attentive_setup_helper.bat"
    
    ; Create a batch file to run elevated commands
    FileOpen $2 $BatchFile w
    FileWrite $2 "@echo off$\r$\n"
    
    ; ---------------------------------------------
    ; A. Legacy Uninstaller (RUN FIRST)
    ; ---------------------------------------------
    StrCpy $R1 ""
    
    ; Check HKLM again for UninstallString just to be sure we have the command
    SetRegView 64
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    SetRegView 32
    ${If} $R1 == ""
        ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ${EndIf}
    
    ${If} $R1 != ""
        DetailPrint "Found legacy uninstaller: $R1"
        FileWrite $9 "Found legacy uninstaller: $R1$\r$\n"
        
        FileWrite $2 "echo Found legacy uninstaller: $R1 >> $TEMP\attentive_migration.log$\r$\n"
        FileWrite $2 "echo Running uninstaller... >> $TEMP\attentive_migration.log$\r$\n"
        
        ; If we have InstallLocation, use _?= to force synchronous wait
        ${If} $LegacyInstallDir != ""
            FileWrite $9 "Using synchronous uninstallation with _?=$LegacyInstallDir$\r$\n"
            FileWrite $2 "$R1 /S _?=$LegacyInstallDir >> $TEMP\attentive_migration.log 2>&1$\r$\n"
        ${Else}
             ; Fallback to standard silent uninstall (might race, but better than nothing)
             FileWrite $9 "Legacy install dir missing. Using standard silent uninstall.$\r$\n"
             FileWrite $2 "$R1 /S >> $TEMP\attentive_migration.log 2>&1$\r$\n"
             ; Add a small timeout to give it a head start if it forks
             FileWrite $2 "timeout /t 3 >nul$\r$\n"
        ${EndIf}
        
    ${Else}
        FileWrite $9 "No legacy uninstaller found (Clean Install).$\r$\n"
    ${EndIf}

    ; ------------------------------------------------
    ; B. Firewall Rules (RUN SECOND)
    ; ------------------------------------------------
    FileWrite $2 "echo Configuring Windows Firewall... >> $TEMP\attentive_migration.log$\r$\n"
    
    ; 1. Remove old rules (cleanup)
    FileWrite $2 "netsh advfirewall firewall delete rule name=$\"${PRODUCT_NAME}$\" >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    ; 2. Add new firewall rules for the NEW location ($INSTDIR)
    FileWrite $2 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=in action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    FileWrite $2 "netsh advfirewall firewall add rule name=$\"${PRODUCT_NAME}$\" dir=out action=allow program=$\"$INSTDIR\${PRODUCT_FILENAME}.exe$\" enable=yes >> $TEMP\attentive_migration.log 2>&1$\r$\n"
    
    FileClose $2
    FileClose $9 

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
