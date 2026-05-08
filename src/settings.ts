import { App, PluginSettingTab, Setting } from "obsidian";
import RelatedNotesPlugin from "./main";

export interface RelatedNotesSettings {
	ignoredFolders: string[];
	autoUpdate: boolean;
	sectionTitle: string;
	autoConvertWords: boolean;
}

export const DEFAULT_SETTINGS: RelatedNotesSettings = {
	ignoredFolders: [],
	autoUpdate: true,
	sectionTitle: "Related Notes",
	autoConvertWords: true
}

export class RelatedNotesSettingTab extends PluginSettingTab {
	plugin: RelatedNotesPlugin;

	constructor(app: App, plugin: RelatedNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Related Notes Settings'});

		new Setting(containerEl)
			.setName('Auto-update on file changes')
			.setDesc('Automatically update related notes when files are modified')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoUpdate)
				.onChange(async (value) => {
					this.plugin.settings.autoUpdate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-convert words to tags')
			.setDesc('Automatically convert words that match existing tags into #tags')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoConvertWords)
				.onChange(async (value) => {
					this.plugin.settings.autoConvertWords = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Section title')
			.setDesc('Title for the related notes section')
			.addText(text => text
				.setPlaceholder('Related Notes')
				.setValue(this.plugin.settings.sectionTitle)
				.onChange(async (value) => {
					this.plugin.settings.sectionTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ignored folders')
			.setDesc('Folders to ignore when scanning for notes (one per line)')
			.addTextArea(text => text
				.setPlaceholder('templates\narchive\nprivate')
				.setValue(this.plugin.settings.ignoredFolders.join('\n'))
				.onChange(async (value) => {
					const folders = value.split('\n').map(f => f.trim()).filter(f => f.length > 0);
					this.plugin.settings.ignoredFolders = folders;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Update all notes now')
			.setDesc('Manually trigger a complete update of all notes')
			.addButton(button => button
				.setButtonText('Update All Notes')
				.onClick(async () => {
					await this.plugin.updateAllNotes();
				}));
	}
}
