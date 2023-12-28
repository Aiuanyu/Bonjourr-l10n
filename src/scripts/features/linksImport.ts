import { randomString } from '../utils'
import { tradThis } from '../utils/translations'
import { PLATFORM } from '../defaults'
import quickLinks from './links'
import onSettingsLoad from '../utils/onsettingsload'
import storage from '../storage'

type BookmarkFolder = {
	title: string
	bookmarks: {
		id: string
		title: string
		url: string
		dateAdded: number
	}[]
}

let bookmarkFolders: BookmarkFolder[] = []

onSettingsLoad(() => {
	const bookmarksdom = document.getElementById('bookmarks') as HTMLDialogElement
	const closebutton = document.getElementById('bmk_close') as HTMLButtonElement
	const applybutton = document.getElementById('bmk_apply') as HTMLButtonElement

	applybutton.addEventListener('click', () => importSelectedBookmarks())
	closebutton.addEventListener('click', () => bookmarksdom.close())
	bookmarksdom.addEventListener('click', (e) => (e.composedPath()[0] === bookmarksdom ? bookmarksdom.close() : null))
})

export default async function linksImport() {
	const bookmarksdom = document.getElementById('bookmarks') as HTMLDialogElement
	const foldersdom = Object.values(document.querySelectorAll<HTMLDivElement>('.bookmarks-folder'))
	const treenode = await getBookmarkTree()

	if (!treenode) {
		return
	}

	bookmarksdom.showModal()
	bookmarkFolders = []
	foldersdom?.forEach((node) => node.remove())

	parseThroughImport(treenode[0])
	addBookmarksFolderToDOM()
}

export async function syncNewBookmarks(init?: number, update?: boolean) {
	if (update !== undefined) {
		updateSyncBookmarks(update)
		return
	}

	const treenode = await getBookmarkTree()

	if (!treenode || !init) {
		return
	}

	parseThroughImport(treenode[0])

	const lastCheck = init ?? Date.now()
	const flatList = bookmarkFolders.map((folder) => folder.bookmarks).flat()
	const newBookmarks = flatList.filter((bookmark) => bookmark.dateAdded > lastCheck)

	console.log(newBookmarks)

	if (newBookmarks.length > 0) {
		quickLinks(undefined, { bookmarks: newBookmarks })
		setTimeout(() => storage.sync.set({ syncbookmarks: Date.now() }), 1000)
	}
}

async function updateSyncBookmarks(update: boolean) {
	const i_syncbookmarks = document.getElementById('#i_syncbookmarks') as HTMLInputElement
	const permission = await getPermissions()

	if (!permission) {
		i_syncbookmarks.checked = false
		update = false
	}

	if (update) {
		storage.sync.set({ syncbookmarks: Date.now() })
	} else {
		storage.sync.remove('syncbookmarks')
	}
}

function importSelectedBookmarks() {
	const bookmarksdom = document.getElementById('bookmarks') as HTMLDialogElement
	const selected = document.querySelectorAll<HTMLLIElement>('li.selected')
	const flatList = bookmarkFolders.map((folder) => folder.bookmarks).flat()
	const ids = Object.values(selected).map((li) => li.id)
	const list: { [key: string]: { url: string; title: string } } = {}
	const selectedLinks = []

	flatList.forEach(({ id, title, url }) => {
		list[id] = { title, url }
	})

	for (const id of ids) {
		selectedLinks.push(list[id])
	}

	quickLinks(undefined, { bookmarks: selectedLinks })
	bookmarksdom.close()
}

function selectBookmark(li: HTMLLIElement) {
	li.classList.toggle('selected')

	const applybutton = document.getElementById('bmk_apply') as HTMLElement
	const selected = document.querySelectorAll('li.selected')
	let counter = selected.length

	// Change submit button text & class on selections
	if (counter === 0) applybutton.textContent = tradThis('Select bookmarks')
	if (counter === 1) applybutton.textContent = tradThis('Import this bookmark')
	if (counter > 1) applybutton.textContent = tradThis('Import these bookmarks')

	applybutton.classList.toggle('none', counter === 0)
}

function parseThroughImport(treenode: chrome.bookmarks.BookmarkTreeNode) {
	const folder: BookmarkFolder = {
		title: treenode.title,
		bookmarks: [],
	}

	for (const child of treenode.children ?? []) {
		if (child.children) {
			parseThroughImport(child)
		}
		//
		else if (child.url) {
			folder.bookmarks?.push({
				id: randomString(6),
				title: child.title,
				url: child.url,
				dateAdded: child.dateAdded ?? 0,
			})
		}
	}

	if (folder.bookmarks.length > 0) {
		bookmarkFolders.push(folder)
	}
}

function addBookmarksFolderToDOM() {
	const container = document.getElementById('bookmarks-container') as HTMLDialogElement

	for (const folder of bookmarkFolders) {
		const listdom = document.createElement('ol')
		const div = document.createElement('div')
		const h2 = document.createElement('h2')

		h2.textContent = folder.title
		div.classList.add('bookmarks-folder')

		for (const bookmark of folder.bookmarks) {
			const li = document.createElement('li')
			const button = document.createElement('button')
			const p_title = document.createElement('p')
			const p_url = document.createElement('p')
			const img = document.createElement('img')

			let url: URL | undefined = undefined

			try {
				url = new URL(bookmark.url)
			} catch (_) {
				return
			}

			img.src = 'https://api.bonjourr.lol/favicon/blob/' + url.origin
			img.draggable = false
			img.alt = ''

			p_title.textContent = bookmark.title
			p_url.textContent = url.href.replace(url.protocol, '').replace('//', '').replace('www.', '')

			button.addEventListener('click', () => selectBookmark(li))
			button.appendChild(img)
			button.appendChild(p_title)
			button.appendChild(p_url)

			li.id = bookmark.id
			li.appendChild(button)
			listdom.appendChild(li)
		}

		div.appendChild(h2)
		div.appendChild(listdom)
		container.appendChild(div)
	}
}

async function getPermissions(): Promise<boolean> {
	const permission = await chrome.permissions.request({ permissions: ['bookmarks'] })
	return permission
}

async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[] | undefined> {
	const namespace = PLATFORM === 'firefox' ? browser : chrome
	const treenode = await namespace.bookmarks.getTree()

	return treenode
}
