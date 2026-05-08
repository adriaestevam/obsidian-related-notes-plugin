# obsidian related notes plugin

un plugin para obsidian que crea automáticamente enlaces entre notas que comparten tags y convierte palabras en tags existentes.

## características

detecta automáticamente notas con tags compartidos y genera wikilinks entre ellas. convierte palabras sueltas en tags cuando coinciden con tags existentes en el vault. reacciona a cambios en archivos para mantener las relaciones actualizadas. permite configurar carpetas ignoradas y personalizar el comportamiento.

## instalación

clona este repositorio en tu carpeta de plugins de obsidian. ejecuta `npm install` para instalar las dependencias. usa `npm run dev` para compilar en modo desarrollo o `npm run build` para producción.

## uso

activa el plugin en la configuración de obsidian. usa el comando "update all related notes" para escanear todo el vault. el plugin actualizará automáticamente las notas cuando modifiques archivos. configura las carpetas ignoradas y otras opciones en la pestaña de configuración.

## desarrollo

este plugin está desarrollado con typescript y sigue las mejores prácticas de la api de obsidian. el código fuente está en la carpeta src y se compila a main.js.
