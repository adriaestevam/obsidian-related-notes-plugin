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
	private lastModifiedFile: string = '';

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
				if (file instanceof TFile && this.shouldProcessFile(file) && file.path !== this.lastModifiedFile) {
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

	extractPotentialTags(content: string): string[] {
		// Extract words that could be tags (3+ characters, alphanumeric)
		const wordRegex = /\b([a-zA-Z]{3,})\b/g;
		const words: string[] = [];
		let match;

		while ((match = wordRegex.exec(content)) !== null) {
			if (match[1]) {
				words.push(match[1].toLowerCase());
			}
		}

		return [...new Set(words)]; // Remove duplicates
	}

	convertWordsToTags(content: string, existingTags: string[]): string {
		console.log(`convertWordsToTags called. autoConvertWords: ${this.settings.autoConvertWords}, existingTags: ${existingTags.join(', ')}`);
        // Always execute the conversion regardless of autoConvertWords setting
        if (existingTags.length === 0) {
            console.log('Returning early - no existing tags');
            return content;
        }

		let modifiedContent = content;
		let changesMade = 0;

		// Sort tags by length (longest first) to avoid partial matches
		const sortedTags = [...existingTags].sort((a, b) => b.length - a.length);

		for (const tag of sortedTags) {
			console.log(`Processing tag: ${tag}`);

			// Create regex to find whole word matches (not already tagged)
			const wordRegex = new RegExp(`\\b${tag}\\b(?!.*#${tag})`, 'gi');
			console.log(`Regex pattern: ${wordRegex}`);

			// Count matches before replacement
			const matches = content.match(wordRegex);
			console.log(`Found matches for '${tag}':`, matches);

			// Replace with #tag, but avoid replacing in code blocks or already tagged words
			modifiedContent = modifiedContent.replace(wordRegex, (match, offset, fullText) => {
                                    console.log(`Replacing '${match}' at offset ${offset}`);
                                    console.log(`Parameters - match: '${match}', offset: ${offset}, fullText: ${fullText ? 'defined' : 'undefined'}, length: ${fullText ? fullText.length : 'N/A'}`);

                                    // Safety checks
                                    if (!fullText || offset === undefined || offset === null) {
                                        console.log('Safety check failed - returning original match');
                                        console.log(`fullText is ${!fullText ? 'undefined/null' : 'defined'}, offset is ${offset === undefined ? 'undefined' : offset === null ? 'null' : offset}`);
                                        return match;
                                    }

				const beforeMatch = fullText.substring(0, offset);
				const codeBlockCount = (beforeMatch.match(/```/g) || []).length;
				const inlineCodeCount = (beforeMatch.match(/`/g) || []).length;

				// Skip if we're inside a code block
				if (codeBlockCount % 2 === 1 || inlineCodeCount % 2 === 1) {
					console.log('Skipping - inside code block');
					return match;
				}

				// Check if it's already a tag
				if (offset > 0 && fullText[offset - 1] === '#') {
					console.log('Skipping - already has #');
					return match;
				}

				changesMade++;
				console.log(`CONVERTING '${match}' to '#${tag}'`);
				return `#${tag}`;
			});
		}

		console.log(`Total changes made: ${changesMade}`);
		console.log(`Original content length: ${content.length}, Modified content length: ${modifiedContent.length}`);
		console.log(`Content changed: ${content !== modifiedContent}`);

		return modifiedContent;
	}

	addTagsToContent(content: string, potentialTags: string[]): string {
		if (potentialTags.length === 0) {
			return content;
		}

		let modifiedContent = content;

		// Sort tags by length (longest first) to avoid partial matches
		const sortedTags = [...potentialTags].sort((a, b) => b.length - a.length);

		for (const tag of sortedTags) {
			// Create regex to find whole word matches (not already tagged)
			const wordRegex = new RegExp(`\\b${tag}\\b(?!.*#${tag})`, 'gi');

			// Replace with #tag, but avoid replacing in code blocks or already tagged words
			modifiedContent = modifiedContent.replace(wordRegex, (...args: [string, string, number, string]) => {
				const match = args[0];
				const offset = args[2];
				const fullText = args[3];

				// Safety checks
				if (!fullText || offset === undefined || offset === null) {
					return match;
				}

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
		const potentialTags = this.extractPotentialTags(content);

		// Combine actual tags and potential tags for relationship detection
		const allTags = [...new Set([...tags, ...potentialTags])];

		const noteInfo: NoteInfo = {
			file,
			tags: allTags,
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

	removeFromCache(file: TFile): void {
		this.notesCache.delete(file.path);
	}

	async updateRelatedNotesSection(file: TFile, relatedNotes: string[]): Promise<void> {
		try {
			let content = await this.app.vault.read(file);
			const lines = content.split('\n');

			const sectionTitle = this.settings.sectionTitle || 'Related Notes';
			const relatedSectionStart = lines.findIndex(line =>
				line.trim() === `## ${sectionTitle}`
			);

			// Get ALL existing tags from entire vault
			const allVaultTags: string[] = [];
			const allFiles = this.app.vault.getMarkdownFiles().filter(f => this.shouldProcessFile(f));

			for (const vaultFile of allFiles) {
				const vaultContent = await this.app.vault.read(vaultFile);
				const vaultTags = this.extractTags(vaultContent);
				allVaultTags.push(...vaultTags);
			}
			const uniqueVaultTags = [...new Set(allVaultTags)];

			// Extract potential tags from current file
			const potentialTags = this.extractPotentialTags(content);
			const existingTags = this.extractTags(content);

			// Find words that match existing tags in vault
			const tagsToAdd: string[] = [];
			for (const potentialTag of potentialTags) {
				if (uniqueVaultTags.includes(potentialTag) && !existingTags.includes(potentialTag)) {
					tagsToAdd.push(potentialTag);
				}
			}

			// Add # to words that match existing vault tags
			if (tagsToAdd.length > 0) {
				content = this.addTagsToContent(content, tagsToAdd);
				new Notice(`Added tags: ${tagsToAdd.join(', ')} to ${file.basename}`);
			}

			// Update lines with modified content
			const updatedLines = content.split('\n');

			let newContent: string;

			if (relatedSectionStart !== -1) {
				// Find the end of the section
				let sectionEnd = relatedSectionStart + 1;
				while (sectionEnd < updatedLines.length && updatedLines[sectionEnd] !== undefined && !updatedLines[sectionEnd]!.startsWith('#')) {
					sectionEnd++;
				}

				// Remove existing section
				updatedLines.splice(relatedSectionStart, sectionEnd - relatedSectionStart);
			}

			// Add new section if there are related notes
			if (relatedNotes.length > 0) {
				const sectionLines = [
					`## ${sectionTitle}`,
					...relatedNotes.map(note => `- [[${note}]]`),
					''
				];

				const insertIndex = relatedSectionStart !== -1 ? relatedSectionStart : updatedLines.length;
				updatedLines.splice(insertIndex, 0, ...sectionLines);
			}

			newContent = updatedLines.join('\n');

			// Set last modified file before modifying to prevent infinite loop
			this.lastModifiedFile = file.path;
			await this.app.vault.modify(file, newContent);

			// Clear last modified file after a short delay
			setTimeout(() => {
				this.lastModifiedFile = '';
			}, 100);
		} catch (error) {
			console.error('Error in updateRelatedNotesSection:', error);
			new Notice(`Error updating related notes for ${file.basename}: ${error}`);
			throw error;
		}
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

			// First pass: extract all existing tags and potential tags
			const allTags: string[] = [];
			const allPotentialTags: string[] = [];
			for (const file of validFiles) {
				const content = await this.app.vault.read(file);
				const tags = this.extractTags(content);
				const potentialTags = this.extractPotentialTags(content);
				allTags.push(...tags);
				allPotentialTags.push(...potentialTags);
			}
			const uniqueTags = [...new Set(allTags)];
			const uniquePotentialTags = [...new Set(allPotentialTags)];

			// Second pass: convert words to tags based on existing tags
			for (const file of validFiles) {
				let content = await this.app.vault.read(file);

				// Debug logging
				console.log(`Processing ${file.basename}, autoConvertWords: ${this.settings.autoConvertWords}`);
				console.log(`Found uniqueTags: ${uniqueTags.join(', ')}`);

				// Convert words that match existing tags in vault
				const modifiedContent = this.convertWordsToTags(content, uniqueTags);
				console.log(`Content changed: ${modifiedContent !== content}`);
				if (modifiedContent !== content) {
					content = modifiedContent;
					this.lastModifiedFile = file.path;
					await this.app.vault.modify(file, content);
					new Notice(`Converted words to tags in ${file.basename}`);
				}

				const tags = this.extractTags(content);
				const potentialTags = this.extractPotentialTags(content);

				// Combine actual tags and potential tags for relationship detection
				const allTagsForNote = [...new Set([...tags, ...potentialTags])];

				const noteInfo: NoteInfo = {
					file,
					tags: allTagsForNote,
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

