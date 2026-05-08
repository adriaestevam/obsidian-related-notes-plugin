import { Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, RelatedNotesSettings, RelatedNotesSettingTab } from "./settings";

interface NoteInfo {
	file: TFile;
	tags: string[];
	relatedNotes: string[];
}

export default class RelatedNotesPlugin extends Plugin {
	settings: RelatedNotesSettings;
	private notesCache: Map<string, NoteInfo> = new Map();
	private isProcessing: boolean = false;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new RelatedNotesSettingTab(this.app, this));

		// Register file events
			this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					void this.processNote(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					void this.processNote(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.removeFromCache(file);
				}
			})
		);

		// Add command to manually update all notes
		this.addCommand({
			id: 'update-all-related-notes',
			name: 'Update all related notes',
			callback: () => {
				void this.updateAllNotes();
			}
		});

		// Initial scan
		void this.updateAllNotes();
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as RelatedNotesSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	shouldProcessFile(file: TFile): boolean {
		if (file.extension !== 'md') return false;

		const ignoredFolders = this.settings.ignoredFolders;
		if (ignoredFolders.length > 0) {
			const firstFolder = file.path.split('/')[0];
			return firstFolder ? !ignoredFolders.includes(firstFolder) : true;
		}

		return true;
	}

	extractTags(content: string): string[] {
		const tagRegex = /#([a-zA-Z0-9_\-/]+)/g;
		const tags: string[] = [];
		let match;

		while ((match = tagRegex.exec(content)) !== null) {
			if (match[1]) {
				tags.push(match[1]);
			}
		}

		return [...new Set(tags)]; // Remove duplicates
	}

	convertWordsToTags(content: string, existingTags: string[]): string {
		if (!this.settings.autoConvertWords || existingTags.length === 0) {
			return content;
		}

		let modifiedContent = content;

		// Sort tags by length (longest first) to avoid partial matches
		const sortedTags = [...existingTags].sort((a, b) => b.length - a.length);

		for (const tag of sortedTags) {
			// Create regex to find whole word matches (not already tagged)
			const wordRegex = new RegExp(`\\b${tag}\\b(?!.*#${tag})`, 'gi');

			// Replace with #tag, but avoid replacing in code blocks or already tagged words
			modifiedContent = modifiedContent.replace(wordRegex, (...args: [string, string, number, string]) => {
				const match = args[0];
				const offset = args[2];
				const fullText = args[3];

				// Check if we're in a code block
				const beforeMatch = fullText.substring(0, offset);
				const codeBlockCount = (beforeMatch.match(/```/g) || []).length;
				const inlineCodeCount = (beforeMatch.match(/`/g) || []).length;

				// Skip if we're inside a code block
				if (codeBlockCount % 2 === 1 || inlineCodeCount % 2 === 1) {
					return match;
				}

				// Check if it's already a tag
				if (offset > 0 && fullText[offset - 1] === '#') {
					return match;
				}

				return `#${tag}`;
			});
		}

		return modifiedContent;
	}

	async processNote(file: TFile) {
		if (this.isProcessing) return;

		const content = await this.app.vault.read(file);
		const tags = this.extractTags(content);

		const noteInfo: NoteInfo = {
			file,
			tags,
			relatedNotes: []
		};

		this.notesCache.set(file.path, noteInfo);
		await this.findAndUpdateRelatedNotes(file.path);
	}

	async findAndUpdateRelatedNotes(currentNotePath: string) {
		const currentNote = this.notesCache.get(currentNotePath);
		if (!currentNote) return;

		const relatedNotes: string[] = [];

		// Find notes with shared tags
		for (const [path, note] of this.notesCache) {
			if (path === currentNotePath) continue;

			const sharedTags = currentNote.tags.filter(tag => note.tags.includes(tag));
			if (sharedTags.length > 0) {
				relatedNotes.push(note.file.basename);
			}
		}

		currentNote.relatedNotes = relatedNotes;
		await this.updateRelatedNotesSection(currentNote.file, relatedNotes);
	}

	async updateRelatedNotesSection(file: TFile, relatedNotes: string[]) {
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const sectionTitle = this.settings.sectionTitle || 'Related Notes';
		const relatedSectionStart = lines.findIndex(line =>
			line.trim() === `## ${sectionTitle}`
		);

		let newContent: string;

		if (relatedSectionStart !== -1) {
			// Find the end of the section
			let sectionEnd = relatedSectionStart + 1;
			while (sectionEnd < lines.length && lines[sectionEnd] !== undefined && !lines[sectionEnd]!.startsWith('#')) {
				sectionEnd++;
			}

			// Remove existing section
			lines.splice(relatedSectionStart, sectionEnd - relatedSectionStart);
		}

		// Add new section if there are related notes
		if (relatedNotes.length > 0) {
			const sectionLines = [
				`## ${sectionTitle}`,
				...relatedNotes.map(note => `- [[${note}]]`),
				''
			];

			const insertIndex = relatedSectionStart !== -1 ? relatedSectionStart : lines.length;
			lines.splice(insertIndex, 0, ...sectionLines);
		}

		newContent = lines.join('\n');
		await this.app.vault.modify(file, newContent);
	}

	removeFromCache(file: TFile) {
		this.notesCache.delete(file.path);
	}

	async updateAllNotes() {
		if (this.isProcessing) return;

		this.isProcessing = true;
		new Notice('Scanning all notes for relationships...');

		try {
			// Clear cache
			this.notesCache.clear();

			// Get all markdown files
			const files = this.app.vault.getMarkdownFiles();
			const validFiles = files.filter(file => this.shouldProcessFile(file));

			// First pass: extract all existing tags
			const allTags: string[] = [];
			for (const file of validFiles) {
				const content = await this.app.vault.read(file);
				const tags = this.extractTags(content);
				allTags.push(...tags);
			}
			const uniqueTags = [...new Set(allTags)];

			// Second pass: convert words to tags and extract tags
			for (const file of validFiles) {
				let content = await this.app.vault.read(file);

				// Convert words to tags if enabled
				if (this.settings.autoConvertWords) {
					const modifiedContent = this.convertWordsToTags(content, uniqueTags);
					if (modifiedContent !== content) {
						content = modifiedContent;
						await this.app.vault.modify(file, content);
						new Notice(`Converted words to tags in ${file.basename}`);
					}
				}

				const tags = this.extractTags(content);

				const noteInfo: NoteInfo = {
					file,
					tags,
					relatedNotes: []
				};

			this.notesCache.set(file.path, noteInfo);
			}

			// Find relationships and update notes
			for (const [path, note] of this.notesCache) {
				const relatedNotes: string[] = [];

				for (const [otherPath, otherNote] of this.notesCache) {
					if (path === otherPath) continue;

					const sharedTags = note.tags.filter(tag => otherNote.tags.includes(tag));
					if (sharedTags.length > 0) {
						relatedNotes.push(otherNote.file.basename);
					}
				}

				note.relatedNotes = relatedNotes;
				await this.updateRelatedNotesSection(note.file, relatedNotes);
			}

			new Notice(`Updated ${this.notesCache.size} notes with relationships`);
		} catch (error) {
			console.error('Error updating all notes:', error);
			new Notice('Error updating notes');
		} finally {
			this.isProcessing = false;
		}
	}
}

