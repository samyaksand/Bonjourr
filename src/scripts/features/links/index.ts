import { isElem, getLiFromEvent, getDefaultIcon, createTitle, isLink } from './helpers'
import { getHTMLTemplate, randomString, stringMaxSize } from '../../utils'
import { displayInterface } from '../../index'
import displayEditDialog from './edit'
import { eventDebounce } from '../../utils/debounce'
import onSettingsLoad from '../../utils/onsettingsload'
import transitioner from '../../utils/transitioner'
import errorMessage from '../../utils/errormessage'
import { tradThis } from '../../utils/translations'
import { BROWSER } from '../../defaults'
import startDrag from './drag'
import initTabs from './tabs'
import storage from '../../storage'

type Link = Links.Link
type Elem = Links.Elem
type Folder = Links.Folder

type LinksUpdate = {
	bookmarks?: { title: string; url: string }[]
	newtab?: boolean
	style?: string
	row?: string
	tab?: boolean
	addTab?: boolean
	removeTab?: number
	moveLinks?: string[]
	addLink?: boolean
	addFolder?: string[]
	groupTitle?: string
	addToFolder?: AddToFolder
	moveToTab?: MoveToTarget
	removeFromFolder?: string[]
	deleteLinks?: string[]
}

type AddToFolder = {
	source: string
	target: string
}

type MoveToTarget = {
	ids: string[]
	target: string
	source?: string
}

type Bookmarks = {
	title: string
	url: string
}[]

type SubmitLink = { type: 'link' }
type SubmitLinkFolder = { type: 'folder'; ids: string[] }
type ImportBookmarks = { type: 'import'; bookmarks: Bookmarks }
type LinkSubmission = SubmitLink | SubmitLinkFolder | ImportBookmarks

const domlinkblocks = document.getElementById('linkblocks') as HTMLUListElement
let selectallTimer = 0

export default async function quickLinks(init?: Sync.Storage, event?: LinksUpdate) {
	if (event) {
		linksUpdate(event)
		return
	}

	if (!init) {
		errorMessage('No data for quick links !')
		return
	}

	// set class before appendBlock, cannot be moved
	domlinkblocks.className = init.linkstyle ?? 'large'
	domlinkblocks.classList.toggle('hidden', !init.quicklinks)

	initblocks(init)
	initTabs(init)
	initRows(init.linksrow, init.linkstyle)
}

//
// Initialisation
//

export async function initblocks(data: Sync.Storage): Promise<true> {
	const tabList = document.querySelector<HTMLUListElement>('#link-list')
	const folderid = domlinkblocks.dataset.folderid

	const allLinks = Object.values(data).filter((val) => isLink(val)) as Link[]
	const links = !!folderid ? getLinksInFolder(data, folderid) : getLinksInTab(data)
	const ids = links.map((link) => link._id)

	const linksInFolders = allLinks.filter((link) => !link.folder && typeof link.parent === 'string')
	const children = document.querySelectorAll<HTMLLIElement>('#link-list > li')
	const childrenIds = [...children].map((li) => li.id)

	for (const child of children) {
		if (ids.includes(child.id) === false) {
			child.remove()
		}
	}

	// Exit early if no links
	if (links.length === 0) {
		displayInterface('links')
		return true
	}

	for (const link of links) {
		const liIndex = childrenIds.indexOf(link._id)
		const liExistsOnInterface = liIndex !== -1
		let li: HTMLLIElement

		if (liExistsOnInterface) {
			li = children[childrenIds.indexOf(link._id)]
			li.removeAttribute('style')
			tabList?.appendChild(li)
		}
		//
		else {
			li = isElem(link) ? createElem(link, data.linknewtab) : createFolder(link, linksInFolders)
			li.addEventListener('keyup', displayEditDialog)
			li.addEventListener('click', selectAll)
			li.addEventListener('pointerdown', selectAll)
			li.addEventListener('pointerdown', startDrag)
		}

		tabList?.appendChild(li)
	}

	displayInterface('links')

	return true
}

function createFolder(link: Links.Folder, folderChildren: Link[]): HTMLLIElement {
	const linksInThisFolder = folderChildren.filter((l) => !l.folder && l.parent === link._id)
	const li = getHTMLTemplate<HTMLLIElement>('link-folder', 'li')
	const imgs = li.querySelectorAll('img')!
	const span = li.querySelector('span')!

	li.id = link._id
	span.textContent = createTitle(link)
	li.addEventListener('click', openFolder)

	for (let i = 0; i < linksInThisFolder.length; i++) {
		const img = imgs[i]
		const elem = linksInThisFolder[i]

		if (img && isElem(elem)) {
			createIcons(img, elem)
		}
	}

	return li
}

function createElem(link: Links.Elem, openInNewtab: boolean) {
	const li = getHTMLTemplate<HTMLLIElement>('link-elem', 'li')
	const span = li.querySelector('span')!
	const anchor = li.querySelector('a')!
	const img = li.querySelector('img')!

	li.id = link._id
	anchor.href = stringMaxSize(link.url, 512)
	span.textContent = createTitle(link)
	createIcons(img, link)

	if (openInNewtab) {
		if (BROWSER === 'safari') {
			anchor.onclick = handleSafariNewtab
		} else {
			anchor.target = '_blank'
		}
	}

	return li
}

function createIcons(currimg: HTMLImageElement, link: Links.Elem) {
	let hasloaded = false

	currimg.src = link.icon ?? getDefaultIcon(link.url)
	currimg.addEventListener('load', () => (hasloaded = true))

	setTimeout(() => {
		if (hasloaded) {
			return
		}

		const newimg = document.createElement('img')

		currimg.src = 'src/assets/interface/loading.svg'
		newimg.src = link.icon ?? getDefaultIcon(link.url)

		newimg.addEventListener('load', () => {
			currimg.src = newimg.src
			storage.sync.set({ [link._id]: link })
		})
	}, 50)
}

function initRows(row: number, style: string) {
	const linklist = document.getElementById('link-list')
	const sizes = {
		large: { width: 4.8, gap: 2.3 },
		medium: { width: 3.5, gap: 2 },
		small: { width: 2.5, gap: 2 },
		inline: { width: 10, gap: 2 },
		text: { width: 5, gap: 2 }, // arbitrary width because width is auto
	}

	if (linklist && style in sizes) {
		const { width, gap } = sizes[style as keyof typeof sizes]
		document.documentElement.style.setProperty('--links-width', Math.ceil((width + gap) * row) + 'em')
	}
}

//
//	Events
//

onSettingsLoad(() => {
	document.addEventListener('close-folder', closeFolder)
	document.addEventListener('stop-select-all', () => clearTimeout(selectallTimer))
	document.addEventListener('remove-select-all', removeSelectAll)
})

async function openFolder(event: Event) {
	if (domlinkblocks.className.includes('select-all')) {
		return
	}

	clearTimeout(selectallTimer)
	const li = getLiFromEvent(event)

	if (!li || li.classList.contains('folder') === false) {
		return
	}

	const data = await storage.sync.get()
	const folder = data[li.id] as Links.Folder
	const folderOpenTransition = transitioner()

	folderOpenTransition.first(hide)
	folderOpenTransition.then(changeToFolder)
	folderOpenTransition.finally(show)
	folderOpenTransition.transition(200)

	function hide() {
		domlinkblocks.dataset.folderid = li?.id
		domlinkblocks.classList.add('hiding')
		domlinkblocks.classList.remove('in-folder')
	}

	async function changeToFolder() {
		toggleTabsTitleType(folder.title)
		await initblocks(data)
	}

	function show() {
		domlinkblocks.classList.replace('hiding', 'in-folder')
	}
}

async function closeFolder() {
	const data = await storage.sync.get()
	const folderCloseTransition = transitioner()

	folderCloseTransition.first(hide)
	folderCloseTransition.then(changeToTab)
	folderCloseTransition.finally(show)
	folderCloseTransition.transition(200)

	function hide() {
		domlinkblocks.dataset.folderid = ''
		domlinkblocks.classList.add('hiding')
	}

	async function changeToTab() {
		toggleTabsTitleType(data.linktabs.titles[0], data.linktabs.active)
		await initblocks(data)
	}

	function show() {
		domlinkblocks.classList.remove('in-folder')
		domlinkblocks.classList.remove('hiding')
	}
}

function toggleTabsTitleType(title: string, linktabs?: boolean): void {
	const folderid = domlinkblocks.dataset.folderid
	const firstinput = document.querySelector<HTMLInputElement>('#link-title input')
	const showTitles = folderid ? true : linktabs

	domlinkblocks?.classList.toggle('with-tabs', showTitles)

	if (firstinput) {
		firstinput.value = title
		firstinput.style.width = title.length + 'ch'
		firstinput.placeholder = !!folderid ? tradThis('folder') : tradThis('tab')
	}
}

function selectAll(event: MouseEvent) {
	clearTimeout(selectallTimer)

	const selectAllActive = domlinkblocks.className.includes('select-all')
	const li = getLiFromEvent(event)

	// toggle selection
	if (selectAllActive && event.type.match(/pointerup|click/)) {
		if (!event.button || event.button === 0) {
			li?.classList.toggle('selected')
		}

		event.preventDefault()
		return
	}

	// start select all debounce
	if (!selectAllActive && event.type === 'pointerdown') {
		selectallTimer = setTimeout(() => {
			domlinkblocks.classList.add('select-all')
		}, 600)
	}
}

function removeSelectAll() {
	clearTimeout(selectallTimer)
	domlinkblocks.classList.remove('select-all')
	domlinkblocks.querySelectorAll('.block').forEach((li) => li.classList.remove('selected'))
}

//
// Updates
//

export async function linksUpdate(update: LinksUpdate) {
	if (update.addLink) {
		linkSubmission({ type: 'link' })
	}

	if (update.addFolder) {
		linkSubmission({ type: 'folder', ids: update.addFolder })
	}

	if (update.bookmarks) {
		linkSubmission({ type: 'import', bookmarks: update.bookmarks })
	}

	if (update.addToFolder) {
		addLinkToFolder(update.addToFolder)
	}

	if (update.removeFromFolder) {
		removeFromFolder(update.removeFromFolder)
	}

	if (update.deleteLinks) {
		deleteLinks(update.deleteLinks)
	}

	if (update.moveToTab) {
		moveToOtherTab(update.moveToTab)
	}

	if (update.moveLinks) {
		moveLinks(update.moveLinks)
	}

	if (update.tab !== undefined) {
		setTab(update.tab)
	}

	if (update.addTab !== undefined) {
		addTab()
	}

	if (update.removeTab !== undefined) {
		removeTab(update.removeTab)
	}

	if (update.groupTitle !== undefined) {
		setGroupTitle(update.groupTitle)
	}

	if (update.newtab !== undefined) {
		setOpenInNewTab(update.newtab)
	}

	if (update.style) {
		setLinkStyle(update.style)
	}

	if (update.row) {
		setRows(update.row)
	}
}

async function linkSubmission(arg: LinkSubmission) {
	const folderid = domlinkblocks.dataset.folderid
	const data = await storage.sync.get()
	let newlinks: Link[] = []

	if (arg.type === 'import') {
		newlinks = (arg.bookmarks ?? []).map((b) => validateLink(b.title, b.url))
	}

	if (arg.type === 'link') {
		newlinks = addLink()
	}

	if (arg.type === 'folder') {
		newlinks = addLinkFolder(arg.ids)

		for (const id of arg.ids) {
			const elem = data[id] as Link

			if (elem && !elem.folder) {
				elem.parent = newlinks[0]._id
			}
		}
	}

	for (const link of newlinks) {
		if (folderid && !link.folder) {
			link.parent = folderid
		} else {
			link.parent = data.linktabs.selected
		}

		data[link._id] = link
	}

	storage.sync.set(correctLinksOrder(data))
	initblocks(data)
}

function addLink(): Links.Elem[] {
	const addsFromInterface = document.getElementById('editlink')?.classList.contains('add-link')
	const inputTitleId = addsFromInterface ? 'e_title' : 'i_addlink-title'
	const inputUrlId = addsFromInterface ? 'e_url' : 'i_addlink-url'
	const inputTitle = document.getElementById(inputTitleId) as HTMLInputElement
	const inputUrl = document.getElementById(inputUrlId) as HTMLInputElement

	const title = inputTitle.value
	const url = inputUrl.value

	inputTitle.value = ''
	inputUrl.value = ''

	if (url.length > 3) {
		return [validateLink(title, url)]
	} else {
		return []
	}
}

function addLinkFolder(ids: string[]): Links.Folder[] {
	const titledom = document.getElementById('e_title') as HTMLInputElement
	const title = titledom.value

	titledom.value = ''

	const blocks = [...document.querySelectorAll<HTMLElement>('li.block')]
	const idsOnInterface = blocks.map((block) => block.id)
	const order = idsOnInterface.indexOf(ids[0])

	for (let i = 0; i < ids.length; i++) {
		const dom = document.getElementById(ids[i])
		const isFolder = dom?.classList.contains('folder')

		if (isFolder) {
			ids.splice(i, 1)
		}
	}

	return [
		{
			_id: 'links' + randomString(6),
			folder: true,
			order: order,
			parent: 0,
			title: title,
		},
	]
}

async function addLinkToFolder({ target, source }: AddToFolder) {
	let data = await storage.sync.get()
	const linktarget = data[target] as Links.Link
	const linksource = data[source] as Links.Link
	const ids: string[] = []

	if (!linktarget || !linksource) {
		return
	}

	const getIdsFrom = (id: string) => getLinksInFolder(data, id).map((l) => l._id)
	linktarget.folder ? ids.push(target, ...getIdsFrom(target)) : ids.push(target)
	linksource.folder ? ids.push(source, ...getIdsFrom(source)) : ids.push(source)

	for (const [key, val] of Object.entries(data)) {
		if (isLink(val) === false) {
			continue
		}

		if (ids.includes(val._id) && !val.folder) {
			;(data[key] as Elem).parent = target
			;(data[key] as Elem).order = Date.now()
		}
	}

	;[linksource, linktarget].forEach((link) => {
		if (link.folder) {
			delete data[link._id]
			storage.sync.remove(link._id)
		}
	})

	linkSubmission({ ids, type: 'folder' })
	animateLinksRemove(ids)
}

async function removeFromFolder(ids: string[]) {
	const folderid = domlinkblocks.dataset.folderid
	let data = await storage.sync.get()

	if (!folderid) {
		return
	}

	for (const id of ids) {
		;(data[id] as Link).parent = data.linktabs.selected
		;(data[id] as Link).order = Date.now()
	}

	data = correctLinksOrder(data)
	storage.sync.set(data)
	initblocks(data)
}

async function deleteLinks(ids: string[]) {
	const data = await storage.sync.get()

	for (const id of ids) {
		const link = data[id] as Link

		if (link.folder) {
			getLinksInFolder(data, link._id).forEach((child) => {
				delete data[child._id]
			})
		}

		delete data[id]
	}

	storage.sync.clear()
	storage.sync.set(correctLinksOrder(data))

	animateLinksRemove(ids)
}

async function moveLinks(ids: string[]) {
	const data = await storage.sync.get()

	ids.forEach((id, i) => {
		;(data[id] as Link).order = i
	})

	storage.sync.set(data)
	initblocks(data)
}

async function moveToOtherTab({ ids, target }: MoveToTarget) {
	let data = await storage.sync.get()

	for (const id of ids) {
		;(data[id] as Link).parent = parseInt(target)
		;(data[id] as Link).order = Date.now()
	}

	data = correctLinksOrder(data)
	storage.sync.set(data)
	initblocks(data)
}

async function setGroupTitle(title: string) {
	const folderid = domlinkblocks.dataset.folderid

	if (folderid) {
		const data = await storage.sync.get()
		const folder = data[folderid] as Link

		if (folder.folder) {
			folder.title = title
			data[folderid] = folder
			storage.sync.set(data)
		}
	}
	//
	else {
		const data = await storage.sync.get()
		data.linktabs.titles[data.linktabs.selected ?? 0] = title
		storage.sync.set(data)
	}
}

async function setTab(tab: boolean) {
	const data = await storage.sync.get('linktabs')

	data.linktabs.active = tab
	storage.sync.set({ linktabs: data.linktabs })

	domlinkblocks?.classList.toggle('with-tabs', tab)
}

async function addTab() {
	const data = await storage.sync.get('linktabs')
	data.linktabs.titles.push('')
	storage.sync.set({ linktabs: data.linktabs })
	initTabs(data)
}

async function removeTab(index: number) {
	const data = await storage.sync.get()
	const { titles, selected } = data.linktabs
	const isRemovingFirst = index === 0 || titles.length === 1

	if (isRemovingFirst) {
		return
	}

	for (const link of getLinksInTab(data, index)) {
		delete data[link._id]
	}

	data.linktabs.titles = titles.toSpliced(index, 1)
	data.linktabs.selected -= index === selected ? 1 : 0
	initblocks(data)
	initTabs(data)

	storage.sync.clear()
	storage.sync.set(data)
}

async function setOpenInNewTab(newtab: boolean) {
	const anchors = document.querySelectorAll<HTMLAnchorElement>('.block a')

	for (const anchor of anchors) {
		if (BROWSER === 'safari') {
			if (newtab) {
				anchor.addEventListener('click', handleSafariNewtab)
			} else {
				anchor.removeEventListener('click', handleSafariNewtab)
			}
		} else {
			if (newtab) {
				anchor.setAttribute('target', '_blank')
			} else {
				anchor.removeAttribute('target')
			}
		}
	}

	storage.sync.set({ linknewtab: newtab })
}

async function setLinkStyle(style: string = 'large') {
	if (!isLinkStyle(style)) {
		return
	}

	const data = await storage.sync.get()
	const links = getLinksInTab(data)

	domlinkblocks.classList.remove('large', 'medium', 'small', 'inline', 'text')
	domlinkblocks.classList.add(style)

	for (const link of links) {
		const block = document.getElementById(link._id) as HTMLLIElement
		const span = block.querySelector(`span`) as HTMLElement
		span.textContent = createTitle(link)
	}

	initRows(data.linksrow, style)
	storage.sync.set({ linkstyle: style })
}

function setRows(row: string) {
	const style = [...domlinkblocks.classList].filter(isLinkStyle)[0] ?? 'large'
	const val = parseInt(row ?? '6')
	initRows(val, style)
	eventDebounce({ linksrow: row })
}

function handleSafariNewtab(e: Event) {
	const anchor = e.composedPath().filter((el) => (el as Element).tagName === 'A')[0]
	window.open((anchor as HTMLAnchorElement)?.href)
	e.preventDefault()
}

//
// Helpers
//

function validateLink(title: string, url: string): Links.Elem {
	const startsWithEither = (strs: string[]) => strs.some((str) => url.startsWith(str))

	url = stringMaxSize(url, 512)

	const isConfig = startsWithEither(['about:', 'chrome://', 'edge://'])
	const noProtocol = !startsWithEither(['https://', 'http://'])
	const isLocalhost = url.startsWith('localhost') || url.startsWith('127.0.0.1')

	let prefix = isConfig ? '#' : isLocalhost ? 'http://' : noProtocol ? 'https://' : ''

	url = prefix + url

	return {
		_id: 'links' + randomString(6),
		order: Date.now(), // big number
		title: stringMaxSize(title, 64),
		url: url,
	}
}

function getLinksInFolder(data: Sync.Storage, id: string): Links.Elem[] {
	const links: Elem[] = []

	for (const value of Object.values(data)) {
		if (isElem(value) && value?.parent === id) {
			links.push(value)
		}
	}

	return links.toSorted((a, b) => a.order - b.order)
}

function getLinksInTab(data: Sync.Storage, index?: number): Link[] {
	const selection = index ?? data.linktabs.selected ?? 0
	const links: Link[] = []

	for (const value of Object.values(data)) {
		if (isLink(value) && (value?.parent ?? 0) === selection) {
			links.push(value)
		}
	}

	return links.toSorted((a, b) => a.order - b.order)
}

function animateLinksRemove(ids: string[]) {
	for (const id of ids) {
		document.getElementById(id)?.classList.add('removed')
		setTimeout(() => document.getElementById(id)?.remove(), 600)
	}
}

function correctLinksOrder(data: Sync.Storage): Sync.Storage {
	const allLinks = Object.values(data).filter((val) => isLink(val)) as Link[]
	const folderIds = allLinks.filter((link) => link.folder).map(({ _id }) => _id)

	for (const folderId of folderIds) {
		const linksInFolder = getLinksInFolder(data, folderId)

		linksInFolder.forEach((link, i) => {
			link.order = i
			data[link._id]
		})
	}

	for (let i = 0; i < data.linktabs.titles.length; i++) {
		const linksInTab = getLinksInTab(data, i)

		linksInTab.forEach((link, i) => {
			link.order = i
			data[link._id]
		})
	}

	return data
}

function isLinkStyle(s: string): s is Sync.Storage['linkstyle'] {
	return ['large', 'medium', 'small', 'inline', 'text'].includes(s)
}