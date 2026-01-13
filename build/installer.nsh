!include "MUI2.nsh"

!define APP_NAME "Attentive"
!define EXEC_NAME "${PRODUCT_NAME}.exe"

!macro customInstall
  DetailPrint "Configuring Windows Firewall..."
  
  ; Remove old rules just in case
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  
  ; Add new Allow rule
  ; We use $INSTDIR\${PRODUCT_FILENAME}.exe because electron-builder uses product filename for the main exe
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=out action=allow program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes'
  
  DetailPrint "Firewall rules updated."
!macroend

!macro customUninstall
  DetailPrint "Removing Windows Firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  DetailPrint "Firewall rules removed."
!macroend
