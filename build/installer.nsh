RequestExecutionLevel admin
!include "MUI2.nsh"
!include "LogicLib.nsh"

!macro customInstall
  ; -----------------------------------------------------------
  ; Firewall Rules - Add inbound rule for the application
  ; Since NSIS now runs elevated (admin), netsh runs directly.
  ; -----------------------------------------------------------
  
  ; Remove old rules first (cleanup)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  
  ; Add new firewall rules for the current install location
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes profile=any'

  ; -----------------------------------------------------------
  ; Registry Cleanup & Version Update
  ; 1. Find the EXISTING MSI entry (by name) and update its version.
  ; 2. Remove the NEW NSIS entry (by GUID) to avoid duplicates.
  ; -----------------------------------------------------------
  SetRegView 64
  ; Loop through uninstall keys to find the one matching our Product Name
  StrCpy $0 0
  ${Do}
    EnumRegKey $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
    ${If} $1 == ""
      ${ExitDo}
    ${EndIf}
    
    ReadRegStr $2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ${If} $2 == "${PRODUCT_NAME}"
      ; Found existsing MSI entry, update its version
      WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayVersion" "${VERSION}"
      ${ExitDo}
    ${EndIf}
    
    IntOp $0 $0 + 1
  ${Loop}

  ; Remove the duplicate NSIS entry we just created
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME} ${VERSION}"
  SetRegView 32
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
!macroend

!macro customUninstall
  ; Firewall cleanup on uninstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
!macroend

Function .onInstSuccess
  ; Auto-launch after silent update (electron-updater calls with /S flag)
  ${If} ${Silent}
    Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
  ${EndIf}
FunctionEnd
