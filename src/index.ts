import joplin from 'api'
import { v4 as uuidv4 } from 'uuid';

import { ContentScriptType, ToolbarButtonLocation, MenuItem, MenuItemLocation, SettingItemType } from 'api/types'
import { createDiagramResource, getDiagramResource, updateDiagramResource, clearDiskCache } from './resources';

const Config = {
  ContentScriptId: 'excalidraw-script',
}

const buildDialogHTML = (diagramBody: string): string => {
  return `
		<form name="main" style="display:none">
			<input type="" name="excalidraw_diagram_json"  id="excalidraw_diagram_json" value='${diagramBody}'>
		</form>
		`
}

function diagramMarkdown(diagramId: string) {
  return `![excalidraw](excalidraw://${diagramId})`
}

const openDialog = async (diagramId: string, isNewDiagram: boolean, theme: string) => {
  let diagramBody = "{}";
  const appPath = await joplin.plugins.installationDir();

  if (!isNewDiagram) {
    const diagramResource = await getDiagramResource(diagramId);
    diagramBody = diagramResource.dataJson;
  }

  const diagramObject = JSON.parse(diagramBody);
  diagramObject.appState = diagramObject.appState || {};
  diagramObject.appState.theme = theme;
  diagramBody = JSON.stringify(diagramObject);

  let dialogs = joplin.views.dialogs;
  let diglogHandle = await dialogs.create(`excalidraw-dialog-${uuidv4()}`);
  
  let header = buildDialogHTML(diagramBody);
  let iframe = `<iframe id="excalidraw_iframe" style="position:absolute;border:0;width:100%;height:100%;" src="${appPath}\\local-excalidraw\\index.html" title="description"></iframe>`

  await dialogs.setHtml(diglogHandle, header + iframe);
  await dialogs.setButtons(diglogHandle, [
    { id: 'ok', title: 'Save' },
    { id: 'cancel', title: 'Close' }
  ]);
  await dialogs.setFitToContent(diglogHandle, false);

  let dialogResult = await dialogs.open(diglogHandle);
  if (dialogResult.id === 'ok') {
    if (isNewDiagram) {
      diagramId = await createDiagramResource(dialogResult.formData.main.excalidraw_diagram_json)
      await joplin.commands.execute('insertText', diagramMarkdown(diagramId))
    } else {
      await updateDiagramResource(diagramId, dialogResult.formData.main.excalidraw_diagram_json)
    }
  }
}

joplin.plugins.register({
  onStart: async () => {

    const installDir = await joplin.plugins.installationDir();		
		const excalidrawCssFilePath = installDir + '/excalidraw.css';
		await (joplin as any).window.loadChromeCssFile(excalidrawCssFilePath);

    clearDiskCache();
    /* support excalidraw dialog */
    await joplin.contentScripts.register(
      ContentScriptType.MarkdownItPlugin,
      Config.ContentScriptId,
      './contentScript.js'
    );

    await joplin.settings.registerSection("excalidrawSettingSection", {
      label: "Excalidraw",
      iconName: "fas fa-palette",
      description: `🔄 Please note that you have to restart Joplin for the changes to take effect.`
    });

    await joplin.settings.registerSettings({
      theme: {
        label: "Theme",
        value: "light",
        type: SettingItemType.String,
        section: "excalidrawSettingSection",
        isEnum: true,
        public: true,
        options: {
          light: "Light",
          dark: "Dark",
        },
        description:
          "This option is only for setting the default theme in Excalidraw, you can still change the theme within the Excalidraw interface."
      }
    });

    const theme = await joplin.settings.value("theme");

    await joplin.contentScripts.onMessage(Config.ContentScriptId, (message: any) => {
      openDialog(message, false, theme);
    });
    
    await joplin.commands.register({
      name: 'addExcalidraw',
      label: 'add excalidraw panel',
      iconName: 'icon-excalidraw-plus-icon-filled',
      execute: async () => {
        openDialog("", true, theme);
      }
    });

    await joplin.views.toolbarButtons.create('addExcalidraw', 'addExcalidraw', ToolbarButtonLocation.EditorToolbar);
  },
})
