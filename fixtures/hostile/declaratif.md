# Déclaratif (fixture hostile)

Réponse test : <script>alert('xss')</script> — payload d'injection conservé tel
quel, pour les futurs tests d'échappement HTML de `report.html` (Part 6). Ce
fichier lui-même est un texte UTF-8/LF ordinaire ; seule sa VALEUR est hostile.
