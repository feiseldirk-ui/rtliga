# Verbindliche UI-Vorgaben für RTLiga

- Alle Eingabe-, Auswahl-, Hinweis-, Fehler- und Bestätigungsfelder müssen zum hellen RTLiga-App-Design passen, einschließlich der geöffneten Auswahl.
- Keine nativen Browser-/Betriebssystem-Auswahlfenster und keine window.alert-, window.confirm- oder window.prompt-Dialoge verwenden.
- React-Auswahlfelder immer mit `src/shared/ui/AppSelect.jsx` umsetzen. Hinweise und Bestätigungen mit den vorhandenen AppDialog-/ConfirmDialog-Komponenten darstellen.
- Auswahl von Schützen im Adminbereich immer zweistufig: zuerst Verein, danach ausschließlich Schützen dieses Vereins. Beim Vereinswechsel muss die Schützenauswahl zurückgesetzt werden.
- Diese Vorgaben gelten auch für zukünftige Erweiterungen und für den internationalen Bereich. Die internationale Oberfläche verwendet entsprechend ihre eigenen Dialogkomponenten im gleichen Design.
