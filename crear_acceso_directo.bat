@echo off
rem Crea en el escritorio un acceso directo a Recuento_UFC.html con el icono del programa.
rem Se ejecuta una sola vez (doble clic). El acceso directo queda apuntando a esta carpeta.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Recuento UFC.lnk')); $s.TargetPath=(Join-Path (Get-Location) 'Recuento_UFC.html'); $s.IconLocation=(Join-Path (Get-Location) 'icono\recuento_ufc.ico'); $s.WorkingDirectory=(Get-Location).Path; $s.Description='Recuento UFC: diluciones y curva OD'; $s.Save()"
if errorlevel 1 (
  echo No se pudo crear el acceso directo.
) else (
  echo Listo: en el escritorio quedo el acceso directo "Recuento UFC" con su icono.
)
pause
