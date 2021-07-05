const id = (name) => document.getElementById(name)
const cl = (name) => document.getElementsByClassName(name)
const has = (that, val) => {
	const dom = id(that)
	if (dom !== null) {
		const result = dom.getAttribute('class') || ''
		return result.indexOf(val) === -1 ? false : true
	} else return false
}
const clas = (dom, add, str) => {
	if (add) dom.classList.add(str)
	else dom.classList.remove(str)
}

const funcsOk = {
	clock: false,
	weatherdesc: false,
	links: false,
}

let stillActive = false,
	rangeActive = false,
	lazyClockInterval = 0,
	// settingsscroll = 0,
	fontList = [],
	fullImage = [],
	fullThumbnails = [],
	googleFontList = {},
	firstpaint = false
const randomseed = Math.floor(Math.random() * 30) + 1,
	dict = askfordict(),
	domshowsettings = id('showSettings'),
	domlinkblocks = id('linkblocks_inner'),
	dominterface = id('interface'),
	domimg = id('background'),
	domthumbnail = cl('thumbnail'),
	domclock = id('clock'),
	mobilecheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? true : false,
	BonjourrAnimTime = 400,
	loadtimeStart = performance.now()

// lsOnlineStorage works exactly like chrome.storage
// Just need to replace every chrome.storage
// And maybe change import option

const lsOnlineStorage = {
	get: (which, callback) => {
		const key = which === 'backgrounds' ? 'bonjourrBackgrounds' : 'bonjourr'
		const data = localStorage[key] ? JSON.parse(localStorage[key]) : {}
		callback(data)
	},
	set: (prop) => {
		lsOnlineStorage.get(null, (data) => {
			if (typeof prop === 'object') {
				const [key, val] = Object.entries(prop)[0]

				if (key === 'import') data = val
				else data[key] = val

				localStorage.bonjourr = JSON.stringify(data)
			}
		})
	},
	bgset: (prop) => {
		lsOnlineStorage.get('backgrounds', (data) => {
			if (typeof prop === 'object') {
				data[Object.entries(prop)[0][0]] = Object.entries(prop)[0][1]
				localStorage.bonjourrBackgrounds = JSON.stringify(data)
			}
		})
	},
	log: (isbg) => lsOnlineStorage.get(isbg, (data) => console.log(data)),
	del: () => localStorage.clear(),
}

function deleteBrowserStorage() {
	chrome.storage.sync.clear()
	chrome.storage.local.clear()
	localStorage.clear()
}

function getBrowserStorage(callback) {
	chrome.storage.sync.get(null, (data) => {
		if (callback) callback(data)
		else console.log(data)
	})
}

function getLocalStorage() {
	chrome.storage.local.get(null, (data) => {
		console.log(data)
	})
}

//cache un peu mieux les données dans le storage
function localEnc(input = 'no', enc = true) {
	let a = input.split(''),
		n = ''
	for (let i in a) n += String.fromCharCode(a[i].charCodeAt() + (enc ? randomseed : -randomseed))
	return n
}

function slowRange(tosave, time = 150) {
	//timeout avant de save pour éviter la surcharge d'instructions de storage
	clearTimeout(rangeActive)
	rangeActive = setTimeout(function () {
		chrome.storage.sync.set(tosave)
	}, time)
}

function slow(that) {
	that.setAttribute('disabled', '')
	stillActive = setTimeout(() => {
		that.removeAttribute('disabled')
		clearTimeout(stillActive)
		stillActive = false
	}, 700)
}

function traduction(ofSettings, init) {
	function traduis(lang) {
		document.documentElement.setAttribute('lang', lang)

		if (lang !== 'en') {
			const trns = (ofSettings ? id('settings') : document).querySelectorAll('.trn')
			trns.forEach((t) => (dict[t.innerText] ? (t.innerText = dict[t.innerText][lang]) : ''))
		}
	}

	if (init && !ofSettings) traduis(init)
	else chrome.storage.sync.get('lang', (data) => traduis(data.lang))
}

function tradThis(str) {
	const lang = document.documentElement.getAttribute('lang')
	return lang === 'en' ? str : dict[str][lang]
}

function newClock(eventObj, init) {
	function displayControl() {
		const numeric = id('clock'),
			analog = id('analogClock'),
			analogSec = id('analogSeconds')

		//cache celle qui n'est pas choisi
		clas(numeric, clock.analog, 'hidden')
		clas(analog, !clock.analog, 'hidden')

		//cache l'aiguille des secondes
		clas(analogSec, !clock.seconds && clock.analog, 'hidden')
	}

	function main(change) {
		//retourne une liste [heure, minutes, secondes]
		function time() {
			const date = new Date()
			return [date.getHours(), date.getMinutes(), date.getSeconds()]
		}

		//besoin pour numerique et analogue
		function timezone(timezone, hour) {
			if (timezone === 'auto' || timezone === NaN) return hour
			else {
				let d = new Date()
				let offset = d.getTimezoneOffset()
				let utc = hour + offset / 60
				let setTime = (utc + parseInt(timezone)) % 24

				if (setTime < 0) setTime = 24 + setTime

				return setTime
			}
		}

		function numerical(timearray) {
			//seul numerique a besoin du ampm
			function toAmpm(val) {
				if (val > 12) val -= 12
				else if (val === 0) val = 12
				else val

				return val
			}

			function fixunits(val) {
				val = val < 10 ? '0' + val : val
				return val.toString()
			}

			let h = clock.ampm ? toAmpm(timearray[0]) : timearray[0],
				m = fixunits(timearray[1]),
				s = fixunits(timearray[2])

			if (clock.seconds) {
				domclock.innerText = `${h}:${m}:${s}`
			} else if (change || domclock.innerText.length === 0 || s === '00') {
				domclock.innerText = `${h}:${m}`
			}
		}

		function analog(timearray) {
			function rotation(that, val) {
				that.style.transform = `rotate(${parseInt(val)}deg)`
			}

			let s = timearray[2] * 6,
				m = timearray[1] * 6, // + (s / 60),
				h = timearray[0] * 30 //% 12 / 12 * 360 + (m / 12);

			//bouge les aiguilles minute et heure quand seconde ou minute arrive à 0
			if (true || timearray[2] === 0) rotation(id('minutes'), m)
			if (true || timearray[1] === 0) rotation(id('hours'), h)

			//tourne pas les secondes si pas de seconds
			if (clock.seconds) rotation(id('analogSeconds'), s)
		}

		//timezone control
		//analog control
		const array = time()

		array[0] = timezone(clock.timezone, array[0])
		clock.analog ? analog(array) : numerical(array)
	}

	function startClock(change) {
		//stops multiple intervals
		clearInterval(lazyClockInterval)

		displayControl()
		main(change)
		lazyClockInterval = setInterval(main, 1000)
	}

	function changeAnalogFace(face = 'none') {
		//
		// Clockwise
		const chars = {
			none: ['', '', '', ''],
			number: ['12', '3', '6', '9'],
			roman: ['XII', 'III', 'VI', 'IX'],
			marks: ['│', '─', '│', '─'],
		}

		document.querySelectorAll('#analogClock .numbers').forEach((mark, i) => (mark.innerText = chars[face][i]))
	}

	//controle très stricte de clock comme vous pouvez le voir
	//(je sais que je peux faire mieux)
	let clock = {
		analog: false,
		seconds: false,
		ampm: false,
		timezone: 'auto',
		face: 'none',
	}

	if (eventObj) {
		chrome.storage.sync.get('clock', (data) => {
			if (data.clock) {
				clock = {
					analog: data.clock.analog,
					seconds: data.clock.seconds,
					ampm: data.clock.ampm,
					timezone: data.clock.timezone,
					face: data.clock.face,
				}
			}

			//event change of clock parameters
			clock[eventObj.param] = eventObj.value
			chrome.storage.sync.set({ clock: clock })

			startClock(true)
			changeAnalogFace(clock.face)
		})
	} else {
		if (init) {
			clock = {
				analog: init.analog,
				seconds: init.seconds,
				ampm: init.ampm,
				timezone: init.timezone,
				face: init.face,
			}
		}

		startClock(true)
		changeAnalogFace(clock.face)
		canDisplayInterface('clock')
	}
}

function date(event, usdate) {
	const date = new Date()
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	]

	if (usdate) {
		id('jour').innerText = tradThis(days[date.getDay()]) + ','
		id('chiffre').innerText = tradThis(months[date.getMonth()])
		id('mois').innerText = date.getDate()
	} else {
		id('jour').innerText = tradThis(days[date.getDay()])
		id('chiffre').innerText = date.getDate()
		id('mois').innerText = tradThis(months[date.getMonth()])
	}

	if (event) chrome.storage.sync.set({ usdate: usdate })
}

function greetings() {
	const h = new Date().getHours()
	let message

	if (h > 6 && h < 12) message = 'Good Morning'
	else if (h >= 12 && h < 18) message = 'Good Afternoon'
	else if (h >= 18 && h <= 23) message = 'Good Evening'
	else message = 'Good Night'

	id('greetings').innerText = tradThis(message)
}

function quickLinks(event, that, initStorage) {
	// Pour ne faire qu'un seul storage call
	// [{ index: number, url: string }]
	const linksFaviconsToUpdate = []
	let hovered, dragged, current

	//enleve les selections d'edit
	const removeLinkSelection = () =>
		domlinkblocks.querySelectorAll('.l_icon_wrap').forEach(function (e) {
			clas(e, false, 'selected')
		})

	//initialise les blocs en fonction du storage
	//utilise simplement une boucle de appendblock
	function initblocks(links) {
		if (links.length > 0) links.map((a, i) => appendblock(a, i, links))
		canDisplayInterface('links')
	}

	function addIcon(elem, arr, index, links) {
		//prend le domaine de n'importe quelle url
		const a = document.createElement('a')
		a.href = arr.url
		const hostname = a.hostname

		// fetch l'icône et l'ajoute
		const img = new Image()
		const url = 'https://api.faviconkit.com/' + hostname + '/144'

		img.onload = () => {
			// Change to loaded favicon
			elem.querySelector('img').src = url

			// Save changes memory var
			linksFaviconsToUpdate.push({ index, url })
			const howManyToSave = links.filter((link) => link.icon === 'src/images/icons/favicon.png')

			// Last to save ? Update storage
			if (linksFaviconsToUpdate.length === howManyToSave.length) {
				linksFaviconsToUpdate.forEach((link) => (links[link.index].icon = link.url))
				chrome.storage.sync.set({ links: links })
			}
		}
		img.src = url
		img.remove()
	}

	function appendblock(arr, index, links) {
		let { icon, title, url } = arr

		// no icon ? + 1.9.2 dead favicons fix
		if (icon.length === 0 || icon === 'src/images/icons/favicon.png') {
			icon = 'src/assets/images/loading.gif'
		}

		//le DOM du block
		let b = `<div class='block' draggable="false" source='${url}'>
			<div class='l_icon_wrap' draggable="false">
				<img class='l_icon' src='${icon}' draggable="false">
			</div>
			${title ? '<span>' + title + '</span>' : ''}
		</div>`

		//ajoute un wrap
		let block_parent = document.createElement('div')
		block_parent.setAttribute('class', 'block_parent')
		block_parent.setAttribute('draggable', 'true')
		block_parent.innerHTML = b

		//l'ajoute au dom
		domlinkblocks.appendChild(block_parent)

		//met les events au dernier elem rajouté
		addEvents(domlinkblocks.lastElementChild)

		//si online et l'icon charge, en rechercher une
		const imageLoading = icon === 'src/assets/images/loading.gif'
		if (window.navigator.onLine && imageLoading) addIcon(domlinkblocks.lastElementChild, arr, index, links)
	}

	function addEvents(elem) {
		function handleDrag(is, that) {
			chrome.storage.sync.get('links', (data) => {
				const i = findindex(that)

				if (is === 'start') dragged = [elem, data.links[i], i]
				else if (is === 'enter') hovered = [elem, data.links[i], i]
				else if (is === 'end') {
					//changes html blocks
					current = hovered[0].innerHTML
					hovered[0].innerHTML = dragged[0].innerHTML
					dragged[0].innerHTML = current

					// Switches link storage
					let allLinks = data.links

					allLinks[dragged[2]] = hovered[1]
					allLinks[hovered[2]] = dragged[1]

					chrome.storage.sync.set({ links: allLinks })
				}
			})
		}

		elem.ondragstart = function (e) {
			e.dataTransfer.setData('text/plain', e.target.id)
			e.currentTarget.style.cursor = 'pointer'
			handleDrag('start', this)
		}

		elem.ondragenter = function (e) {
			e.preventDefault()
			handleDrag('enter', this)
		}

		elem.ondragend = function (e) {
			e.preventDefault()
			handleDrag('end', this)
		}

		elem.oncontextmenu = function (e) {
			e.preventDefault()
			if (mobilecheck) editlink(this)
		}

		elem.onmouseup = function (e) {
			removeLinkSelection()
			e.which === 3 ? editlink(this) : !has('settings', 'shown') ? openlink(this, e) : ''
		}
	}

	function showDelIcon(input) {
		const img = input.nextElementSibling
		if (input.value === '') img.classList.remove('shown')
		else img.classList.add('shown')
	}

	function editEvents() {
		function closeEditLink() {
			removeLinkSelection()
			id('edit_linkContainer').classList.add('hiding')
			setTimeout(() => id('edit_linkContainer').setAttribute('class', ''), BonjourrAnimTime)
		}

		function emptyAndHideIcon(e) {
			e.target.previousElementSibling.value = ''
			e.target.classList.remove('shown')
		}

		id('e_delete').onclick = function () {
			removeLinkSelection()
			removeblock(parseInt(id('edit_link').getAttribute('index')))
			clas(id('edit_linkContainer'), false, 'shown')
		}

		id('e_submit').onclick = function () {
			removeLinkSelection()
			editlink(null, parseInt(id('edit_link').getAttribute('index')))
			clas(id('edit_linkContainer'), false, 'shown')
		}

		// close on button
		id('e_close').onmouseup = () => closeEditLink()

		// close on outside click
		id('edit_linkContainer').onmousedown = (e) => {
			if (e.target.id === 'edit_linkContainer') closeEditLink()
		}

		id('re_title').onmouseup = (e) => emptyAndHideIcon(e)
		id('re_url').onmouseup = (e) => emptyAndHideIcon(e)
		id('re_iconurl').onmouseup = (e) => emptyAndHideIcon(e)

		id('e_title').onkeyup = (e) => showDelIcon(e.target)
		id('e_url').onkeyup = (e) => showDelIcon(e.target)
		id('e_iconurl').onkeyup = (e) => showDelIcon(e.target)
	}

	function editlink(that, i) {
		const e_title = id('e_title')
		const e_url = id('e_url')
		const e_iconurl = id('e_iconurl')

		//edit est visible
		if (i || i === 0) {
			chrome.storage.sync.get('links', (data) => {
				let allLinks = [...data.links]
				const block = domlinkblocks.children[i + 1]
				const updated = { title: e_title.value, url: e_url.value, icon: e_iconurl.value }

				// Update on interface
				Object.entries(allLinks[i]).forEach(([key, val], j) => {
					if (val !== updated[key]) {
						if (key === 'title') {
							if (!block.querySelector('span')) {
								block
									.querySelector('.l_icon_wrap')
									.insertAdjacentHTML('afterEnd', '<span>' + updated[key] + '</span>')
							} else {
								block.querySelector('span').innerText = updated[key]
							}
						}
						if (key === 'url') block.querySelector('.block').setAttribute('source', updated[key])
						if (key === 'icon') block.querySelector('img').src = updated[key]

						allLinks[i][key] = updated[key]
					}
				})

				// Update in storage
				chrome.storage.sync.set({ links: allLinks })
			})

			//affiche edit avec le bon index
		} else {
			const index = findindex(that)
			const liconwrap = that.querySelector('.l_icon_wrap')
			const container = id('edit_linkContainer')
			const openSettings = has('settings', 'shown')

			clas(liconwrap, true, 'selected')
			clas(container, true, 'shown')
			clas(container, openSettings, 'pushed')

			id('edit_link').setAttribute('index', index)

			chrome.storage.sync.get('links', (data) => {
				const { title, url, icon } = data.links[index]

				e_title.setAttribute('placeholder', tradThis('Title'))
				e_iconurl.setAttribute('placeholder', tradThis('Icon'))

				e_title.value = title
				e_url.value = url
				e_iconurl.value = icon

				showDelIcon(e_title)
				showDelIcon(e_url)
				showDelIcon(e_iconurl)
			})
		}
	}

	function findindex(that) {
		//passe la liste des blocks, s'arrete si that correspond
		//renvoie le nombre de loop pour l'atteindre

		const list = domlinkblocks.children

		for (let i = 0; i < list.length; i++) if (that === list[i]) return i - 1
	}

	function removeblock(index) {
		let count = index

		chrome.storage.sync.get(['links', 'searchbar'], (data) => {
			function ejectIntruder(arr) {
				if (arr.length === 1) return []

				if (count === 0) arr.shift()
				else if (count === arr.length) arr.pop()
				else arr.splice(count, 1)

				return arr
			}

			var linkRemd = ejectIntruder(data.links)

			//si on supprime un block quand la limite est atteinte
			//réactive les inputs
			if (linkRemd.length === 16 - 1) id('i_url').removeAttribute('disabled')

			//enleve le html du block
			var block_parent = domlinkblocks.children[count + 1]
			block_parent.setAttribute('class', 'block_parent removed')

			setTimeout(function () {
				domlinkblocks.removeChild(block_parent)

				//enleve linkblocks si il n'y a plus de links
				if (linkRemd.length === 0) domlinkblocks.style.visibility = 'hidden'
			}, 200)

			chrome.storage.sync.set({ links: linkRemd })
		})
	}

	function linkSubmission() {
		function filterUrl(str) {
			let reg = new RegExp('^(http|https)://', 'i')

			//config ne marche pas
			if (str.startsWith('about:') || str.startsWith('chrome://')) return false

			if (str.startsWith('file://')) return str

			//premier regex pour savoir si c'est http
			if (!str.match(reg)) str = 'http://' + str

			//deuxieme pour savoir si il est valide (avec http)
			if (str.match(reg)) return str.match(reg).input
			else return false
		}

		function saveLink(lll) {
			slow(id('i_url'))

			//remet a zero les inputs
			id('i_title').value = ''
			id('i_url').value = ''

			let full = false

			chrome.storage.sync.get(['links', 'searchbar'], (data) => {
				let arr = []

				//array est tout les links + le nouveau
				if (data.links && data.links.length > 0) {
					if (data.links.length < 16 - 1) {
						arr = data.links
						arr.push(lll)
					} else {
						full = true
					}

					//array est seulement le link
				} else {
					arr.push(lll)
					domlinkblocks.style.visibility = 'visible'
				}

				//si les blocks sont moins que 16
				if (!full) {
					chrome.storage.sync.set({ links: arr })
					appendblock(lll, arr.length - 1, arr)
				} else {
					//desactive tout les input url
					id('i_url').setAttribute('disabled', 'disabled')
				}
			})
		}

		const titleControl = (t) => (t.length > 42 ? t.slice(0, 42) + '...' : t)

		//append avec le titre, l'url ET l'index du bloc

		let links = {
			title: titleControl(id('i_title').value),
			url: filterUrl(id('i_url').value),
			icon: '',
		}

		//si l'url filtré est juste
		if (links.url && id('i_url').value.length > 2) {
			//et l'input n'a pas été activé ya -1s
			if (!stillActive) saveLink(links)
		}
	}

	function openlink(that, e) {
		const source = that.children[0].getAttribute('source')
		const a_hiddenlink = id('hiddenlink')

		chrome.storage.sync.get('linknewtab', (data) => {
			if (data.linknewtab) {
				chrome.tabs.create({
					url: source,
				})
			} else {
				if (e.which === 2) {
					chrome.tabs.create({
						url: source,
					})
				} else {
					a_hiddenlink.setAttribute('href', source)
					a_hiddenlink.setAttribute('target', '_self')
					a_hiddenlink.click()
				}
			}
		})
	}

	//TOUT LES EVENTS, else init

	if (event === 'input' && that.which === 13) linkSubmission()
	else if (event === 'button') linkSubmission()
	else if (event === 'linknewtab') {
		chrome.storage.sync.set({ linknewtab: that.checked ? true : false })
		id('hiddenlink').setAttribute('target', '_blank')
	}

	if (initStorage) {
		initblocks(initStorage.links || [])
		editEvents()
		id('edit_linkContainer').oncontextmenu = (e) => e.preventDefault()
	}
}

function weather(event, that, initStorage) {
	const tempMax = id('tempMax'),
		maxWrap = id('forecastWrap'),
		weatherDesc = id('weather_desc').children[0]

	function cacheControl(storage) {
		const date = new Date()
		const now = Math.floor(date.getTime() / 1000)
		const param = storage.weather ? storage.weather : ''

		if (storage.weather && storage.weather.lastCall) {
			//si weather est vieux d'une demi heure (1800s)
			//ou si on change de lang
			//faire une requete et update le lastcall
			if (sessionStorage.lang || now > storage.weather.lastCall + 1800) {
				dataHandling(param.lastState)
				request(param, 'current')
				sessionStorage.removeItem('lang')
			} else dataHandling(param.lastState)

			// Forecast tout les 3h
			if (storage.weather.forecastLastCall) {
				if (now > storage.weather.forecastLastCall + 10800) {
					dataHandling(param, true)
					request(param, 'forecast')
				} else dataHandling(param, true)
			} else if (storage.weather.fcHigh) dataHandling(param, true)
		} else {
			//initialise a Paris + Metric
			//c'est le premier call, requete + lastCall = now
			initWeather()
		}
	}

	function initWeather() {
		let param = {
			city: 'Paris',
			ccode: 'FR',
			location: [],
			unit: 'metric',
		}

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				//update le parametre de location
				param.location.push(pos.coords.latitude, pos.coords.longitude)
				chrome.storage.sync.set({ weather: param })

				request(param, 'current')
				request(param, 'forecast')
			},
			(refused) => {
				chrome.storage.sync.set({ weather: param })

				request(param, 'current')
				request(param, 'forecast')
			}
		)
	}

	function request(arg, wCat) {
		function urlControl(arg, forecast) {
			let url = 'https://api.openweathermap.org/data/2.5/'
			const lang = document.documentElement.getAttribute('lang')

			if (forecast) url += 'forecast?appid=' + atob(WEATHER_API_KEY[0])
			else url += 'weather?appid=' + atob(WEATHER_API_KEY[1])

			//auto, utilise l'array location [lat, lon]
			if (arg.location) {
				url += `&lat=${arg.location[0]}&lon=${arg.location[1]}`
			} else {
				url += `&q=${encodeURI(arg.city)},${arg.ccode}`
			}

			url += `&units=${arg.unit}&lang=${lang}`

			return url
		}

		function weatherResponse(parameters, response) {
			//sauvegarder la derniere meteo
			let now = Math.floor(new Date().getTime() / 1000)
			let param = parameters
			param.lastState = response
			param.lastCall = now
			chrome.storage.sync.set({ weather: param })

			//la réponse est utilisé dans la fonction plus haute
			dataHandling(response)
		}

		function forecastResponse(parameters, response) {
			function findHighTemps(forecast) {
				const todayHour = thisdate.getHours()
				let forecastDay = thisdate.getDate()
				let tempMax = -99

				// Late evening forecast for tomorrow
				if (todayHour > 18) {
					const tomorrow = thisdate.setDate(thisdate.getDate() + 1)
					forecastDay = new Date(tomorrow).getDate()
				}

				// Get the highest temp for the specified day
				forecast.list.forEach((elem) => {
					if (new Date(elem.dt * 1000).getDate() === forecastDay)
						tempMax < elem.main.temp_max ? (tempMax = Math.round(elem.main.temp_max)) : ''
				})

				//renvoie high
				return tempMax
			}

			//sauvegarder la derniere meteo
			const thisdate = new Date()
			let param = parameters
			param.fcHigh = findHighTemps(response)
			param.forecastLastCall = Math.floor(thisdate.getTime() / 1000)
			chrome.storage.sync.set({ weather: param })

			dataHandling(param, true)
		}

		let url = wCat === 'current' ? urlControl(arg, false) : urlControl(arg, true)

		let request_w = new XMLHttpRequest()
		request_w.open('GET', url, true)

		request_w.onload = function () {
			let resp = JSON.parse(this.response)

			if (request_w.status >= 200 && request_w.status < 400) {
				if (wCat === 'current') {
					weatherResponse(arg, resp)
				} else if (wCat === 'forecast') {
					forecastResponse(arg, resp)
				}
			} else {
				submissionError(resp.message)
			}
		}

		request_w.send()
	}

	function dataHandling(data, forecast) {
		const hour = new Date().getHours()

		function getIcon() {
			//si le soleil est levé, renvoi jour
			//le renvoie correspond au nom du répertoire des icones jour / nuit
			function dayOrNight(sunset, sunrise) {
				let ss = new Date(sunset * 1000)
				let sr = new Date(sunrise * 1000)

				return hour > sr.getHours() && hour < ss.getHours() ? 'day' : 'night'
			}

			//prend l'id de la météo et renvoie une description
			//correspond au nom de l'icone (+ .png)
			function imgId(c) {
				let temp,
					codes = {
						thunderstorm: 200,
						lightdrizzle: 300,
						showerdrizzle: 302,
						lightrain: 500,
						showerrain: 502,
						snow: 602,
						mist: 701,
						clearsky: 800,
						fewclouds: 801,
						brokenclouds: 803,
					}

				for (let key in codes) {
					if (c >= codes[key]) temp = key
				}

				return temp || 'clearsky'
			}

			let d_n = dayOrNight(data.sys.sunset, data.sys.sunrise)
			let weather_id = imgId(data.weather[0].id)
			id('widget').setAttribute('src', `src/assets/images/weather/${d_n}/${weather_id}.png`)
		}

		function getDescription() {
			//pour la description et temperature
			//Rajoute une majuscule à la description
			let meteoStr = data.weather[0].description
			meteoStr = meteoStr[0].toUpperCase() + meteoStr.slice(1)
			id('desc').innerText = meteoStr + '.'

			//si c'est l'après midi (apres 12h), on enleve la partie temp max
			let dtemp, wtemp

			if (hour < 12) {
				//temp de desc et temp de widget sont pareil
				dtemp = wtemp = Math.floor(data.main.feels_like) + '°'
			} else {
				//temp de desc devient temp de widget + un point
				//on vide la catégorie temp max
				wtemp = Math.floor(data.main.feels_like) + '°'
				dtemp = wtemp + '.'
			}

			id('temp').innerText = dtemp
			id('widget_temp').innerText = wtemp
			weatherDesc.classList.add('shown')
			document.querySelector('#weather_desc .trn').style.opacity = 1

			canDisplayInterface('weatherdesc')
		}

		function getMaxTemp() {
			tempMax.innerText = `${data.fcHigh}°`
			id('forecastTime').innerText = `${tradThis(hour > 21 ? 'tomorrow' : 'today')}.`

			if (hour < 12 || hour > 21) maxWrap.classList.add('shown')
			else maxWrap.classList.remove('shown')
			document.querySelector('#forecastWrap .trn').style.opacity = 1

			canDisplayInterface('weatherhigh')
		}

		if (forecast) {
			getMaxTemp()
		} else {
			getDescription()
			getIcon()
		}
	}

	function submissionError() {
		const city = id('i_city')

		city.value = ''
		city.setAttribute('placeholder', tradThis('City not found'))
	}

	function updateCity() {
		slow(that)

		chrome.storage.sync.get('weather', (data) => {
			const param = data.weather

			param.ccode = i_ccode.value
			param.city = i_city.value

			if (param.city.length < 2) return false

			request(param, 'current')
			request(param, 'forecast')

			i_city.setAttribute('placeholder', param.city)
			i_city.value = ''
			i_city.blur()

			chrome.storage.sync.set({
				weather: param,
			})
		})
	}

	function updateUnit(that) {
		slow(that)

		chrome.storage.sync.get(['weather'], (data) => {
			const param = data.weather

			if (that.checked) {
				param.unit = 'imperial'
			} else {
				param.unit = 'metric'
			}

			request(param, 'current')
			request(param, 'forecast')

			chrome.storage.sync.set({ weather: param })
		})
	}

	function updateLocation(that) {
		slow(that)

		chrome.storage.sync.get('weather', (data) => {
			const param = data.weather
			param.location = []

			if (that.checked) {
				that.setAttribute('disabled', '')

				navigator.geolocation.getCurrentPosition(
					(pos) => {
						//update le parametre de location
						param.location.push(pos.coords.latitude, pos.coords.longitude)

						chrome.storage.sync.set({
							weather: param,
						})

						//request la meteo
						request(param, 'current')
						request(param, 'forecast')

						//update le setting
						clas(sett_city, true, 'hidden')
						that.removeAttribute('disabled')
					},
					() => {
						//désactive geolocation if refused
						that.checked = false
						that.removeAttribute('disabled')

						if (!param.city) initWeather()
					}
				)
			} else {
				clas(sett_city, false, 'hidden')

				i_city.setAttribute('placeholder', param.city)
				i_ccode.value = param.ccode

				param.location = false

				chrome.storage.sync.set({
					weather: param,
				})

				request(param, 'current')
				request(param, 'forecast')
			}
		})
	}

	const WEATHER_API_KEY = [
		'YTU0ZjkxOThkODY4YTJhNjk4ZDQ1MGRlN2NiODBiNDU=',
		'Y2U1M2Y3MDdhZWMyZDk1NjEwZjIwYjk4Y2VjYzA1NzE=',
		'N2M1NDFjYWVmNWZjNzQ2N2ZjNzI2N2UyZjc1NjQ5YTk=',
	]
	const i_city = id('i_city')
	const i_ccode = id('i_ccode')
	const sett_city = id('sett_city')

	if (!id('widget')) {
		const img = document.createElement('img')
		img.id = 'widget'
		img.setAttribute('draggable', 'false')
		id('w_icon').prepend(img)
	}

	//TOUT LES EVENTS, default c'est init
	switch (event) {
		case 'city':
			updateCity()
			break

		case 'units':
			updateUnit(that)
			break

		case 'geol':
			updateLocation(that)
			break

		default:
			cacheControl(initStorage)
	}

	// Checks every 5 minutes if weather needs update
	setTimeout(() => {
		navigator.onLine ? chrome.storage.sync.get(['weather'], (data) => cacheControl(data)) : ''
	}, 5 * 60 * 1000)
}

function initBackground(data) {
	const type = data.background_type || 'dynamic'

	if (type === 'custom') {
		chrome.storage.local.get(null, (datalocal) => {
			const customList = datalocal.custom || []

			if (customList.length > 0) {
				localBackgrounds({ local: datalocal, every: data.custom_every })
			} else {
				// If no custom, change to dynamic
				unsplash(data)
				chrome.storage.sync.set({ background_type: 'dynamic' })
			}
		})

		// Not Custom, load dynamic
	} else unsplash(data)

	const blur = data.background_blur !== undefined ? data.background_blur : 15
	const bright = data.background_bright !== undefined ? data.background_bright : 0.7

	filter('init', [parseFloat(blur), parseFloat(bright)])
}

function imgBackground(val) {
	if (val) {
		let img = new Image()

		img.onload = () => {
			id('background_overlay').style.opacity = `1`
			id('background').style.backgroundImage = `url(${val})`
		}

		img.src = val
		img.remove()
	} else return id('background').style.backgroundImage
}

function freqControl(state, every, last) {
	const d = new Date()
	if (state === 'set') return every === 'tabs' ? 0 : d.getTime()

	if (state === 'get') {
		let calcLast = 0
		let today = d.getTime()

		if (every === 'hour') calcLast = last + 3600 * 1000
		else if (every === 'day') calcLast = last + 86400 * 1000
		else if (every === 'pause') calcLast = 10 ** 13 - 1 //le jour de la fin du monde lmao

		//bool
		return today > calcLast
	}
}

function localBackgrounds(init, thumbnail, newfile) {
	function applyCustomBackground(backgrounds, index) {
		const background = backgrounds[index]

		if (background) {
			const cleanData = background.slice(background.indexOf(',') + 1, background.length)
			b64toBlobUrl(cleanData, (bloburl) => {
				imgBackground(bloburl)
				changeImgIndex(index)
			})
		}
	}

	function preventFromShowingTwice(index, max) {
		const res = Math.floor(Math.random() * max)
		return res === index ? (res + 1) % max : res
	}

	function b64toBlobUrl(b64Data, callback) {
		fetch(`data:image/jpeg;base64,${b64Data}`).then((res) => {
			res.blob().then((blob) => callback(URL.createObjectURL(blob)))
		})
	}

	function changeImgIndex(i) {
		domimg.setAttribute('index', i)
	}

	function addNewImage() {
		let reader = new FileReader()
		reader.onload = function (event) {
			let result = event.target.result

			fullImage.push(result)

			compress(result, 'thumbnail')
			compress(result, 'new')

			chrome.storage.local.get(null, (data) => {
				const custom = data.custom ? data.custom : []
				const bumpedindex = custom.length

				changeImgIndex(bumpedindex)
				chrome.storage.local.set({ customIndex: bumpedindex })
				chrome.storage.local.set({ custom: fullImage })

				if (custom.length === 0) {
					chrome.storage.sync.get('background_type', (data) => {
						if (data.background_type === 'dynamic') chrome.storage.sync.set({ background_type: 'custom' })
					})
				}
			})
		}

		id('background_overlay').style.opacity = '0'

		reader.readAsDataURL(newfile)
	}

	function compress(e, state) {
		//prend l'image complete en arg

		const img = new Image()

		img.onload = () => {
			//const size = document.getElementById('range').value;
			const elem = document.createElement('canvas')
			const ctx = elem.getContext('2d')

			//canvas proportionné à l'image

			//rétréci suivant le taux de compression
			//si thumbnail, toujours 150px
			const height = state === 'thumbnail' ? 150 : img.height * 1 //parseFloat(size));
			const scaleFactor = height / img.height
			elem.width = img.width * scaleFactor
			elem.height = height

			//dessine l'image proportionné
			ctx.drawImage(img, 0, 0, img.width * scaleFactor, height)

			//renvoie le base64
			const data = ctx.canvas.toDataURL(img)
			const cleanData = data.slice(data.indexOf(',') + 1, data.length) //used for blob

			if (state === 'thumbnail') {
				//controle les thumbnails
				addThumbnails(cleanData, fullImage.length - 1)

				fullThumbnails.push(cleanData)
				chrome.storage.local.set({ customThumbnails: fullThumbnails })
			} else {
				//new image loaded from filereader sets image index
				if (state === 'new') {
					changeImgIndex(fullImage.length - 1)
					//save l'index
					chrome.storage.local.set({ customIndex: fullImage.length - 1 })
				}

				//affiche l'image
				b64toBlobUrl(cleanData, (bloburl) => imgBackground(bloburl))
			}
		}

		img.src = e
	}

	function addThumbnails(data, index) {
		//créer une tag html en plus + remove button

		const div = document.createElement('div')
		const i = document.createElement('img')
		const rem = document.createElement('button')
		const wrap = document.getElementById('bg_tn_wrap')
		const file = document.getElementById('fileContainer')

		div.setAttribute('index', index)
		div.setAttribute('class', 'thumbnail')
		rem.setAttribute('class', 'hidden')
		rem.innerText = '✕'
		b64toBlobUrl(data, (bloburl) => (i.src = bloburl))

		div.appendChild(i)
		div.appendChild(rem)
		wrap.insertBefore(div, file)

		//events
		const getParentIndex = (that) => parseInt(that.parentElement.getAttribute('index'))
		const getIndex = (that) => parseInt(that.getAttribute('index'))
		const removeControl = (show, i) => domthumbnail[i].children[1].setAttribute('class', show ? 'shown' : 'hidden')

		//displays / hides remove button
		div.onmouseenter = (e) => removeControl(true, getIndex(e.target))
		div.onmouseleave = (e) => removeControl(false, getIndex(e.target))

		i.onmouseup = (e) => {
			if (e.button === 0) {
				//affiche l'image voulu
				//lui injecte le bon index
				const index = getParentIndex(e.target)

				id('background_overlay').style.opacity = `0`

				compress(fullImage[index])
				changeImgIndex(index)
				chrome.storage.local.set({ customIndex: index })
			}
		}

		rem.onmouseup = (e) => {
			if (e.button === 0) {
				const index = getParentIndex(e.target)
				let currentIndex = parseInt(id('background').getAttribute('index'))

				//removes thumbnail
				domthumbnail[index].remove()

				//rewrite all thumbs indexes
				for (let i = 0; i < domthumbnail.length; i++) {
					domthumbnail[i].setAttribute('index', i)
				}

				//deletes thumbnail from storage
				//concat  [0, index] à [index + 1, fin]
				const deleteArrItem = (arr) => arr.slice(null, index).concat(arr.slice(index + 1))

				fullImage = deleteArrItem(fullImage)
				chrome.storage.local.set({ custom: fullImage })

				fullThumbnails = deleteArrItem(fullThumbnails)
				chrome.storage.local.set({ customThumbnails: fullThumbnails })

				//celui a suppr plus petit que l'actuel, baisse son index
				if (index <= currentIndex) chrome.storage.local.set({ customIndex: currentIndex - 1 })

				// Si derniere image des customs
				if (fullImage.length === 0) {
					unsplash()
					chrome.storage.sync.set({ background_type: 'dynamic' })

					// Sinon load une autre
				} else {
					compress(fullImage[currentIndex - 1] === undefined ? fullImage[currentIndex] : fullImage[currentIndex - 1])
				}
			}
		}
	}

	function displayCustomThumbnails() {
		const thumbnails = document.querySelectorAll('#bg_tn_wrap .thumbnail')

		chrome.storage.local.get('customThumbnails', (data) => {
			if (data.customThumbnails) {
				if (thumbnails.length < data.customThumbnails.length) {
					let cleanData
					let thumbs = data.customThumbnails

					thumbs.forEach((thumb, i) => {
						cleanData = thumb.replace('data:image/jpeg;base64,', '') //used for blob
						addThumbnails(cleanData, i)
					})

					fullThumbnails = data.customThumbnails

					setTimeout(() => {
						chrome.storage.local.get('custom', (data) => {
							fullImage = data.custom
						})
					}, 200)
				}
			}
		})
	}

	if (thumbnail) {
		displayCustomThumbnails()
		return true
	}

	if (newfile) {
		addNewImage()
		return true
	}

	// need all of saved stuff
	const { local, every } = init

	// Slideshow or not, need index
	const index = local.customIndex >= 0 ? local.customIndex : 0
	const customList = local.custom || []

	// Slideshow is activated
	if (every) {
		const last = local.custom_time || 0
		const rand = preventFromShowingTwice(index, customList.length)

		// Need new Image
		if (freqControl('get', every, last)) {
			applyCustomBackground(customList, rand)

			// Updates time & index
			chrome.storage.sync.set({ custom_time: freqControl('set', every) })
			chrome.storage.local.set({ customIndex: rand })
			//
		} else {
			applyCustomBackground(customList, index)
		}

		// No slideshow or no data for it
	} else {
		applyCustomBackground(customList, index)
	}
}

function unsplash(init, event) {
	function noDisplayImgLoad(val, callback) {
		let img = new Image()

		if (callback) img.onload = callback
		img.src = val
		img.remove()
	}

	function imgCredits(image) {
		//
		const country = image.country || 'Photo'
		const city = image.city ? image.city + ', ' : ''

		const credits = [
			{
				text: city + country + ' - ',
				url: `${image.link}?utm_source=Bonjourr&utm_medium=referral`,
			},
			{
				text: image.name + ` `,
				url: `https://unsplash.com/@${image.username}?utm_source=Bonjourr&utm_medium=referral`,
			},
			{
				text: tradThis('on Unsplash'),
				url: 'https://unsplash.com/?utm_source=Bonjourr&utm_medium=referral',
			},
		]

		id('credit').textContent = ''

		credits.forEach((elem) => {
			const dom = document.createElement('a')
			dom.innerText = elem.text
			dom.href = elem.url
			id('credit').appendChild(dom)
		})

		clas(id('credit'), true, 'shown')
	}

	function loadBackground(props) {
		imgBackground(props.url)
		imgCredits(props)

		console.log(props.color)
	}

	// 2
	function cacheControl(dynamic, local) {
		// 3
		function chooseCollection() {
			//
			// Mutates collectionIds to match selected collection
			function filterUserCollection(str) {
				str = str.replace(` `, '')
				collectionsIds.user = str
				return 'user'
			}

			if (event && event.collection) {
				if (event.collection.length > 0) return filterUserCollection(event.collection)
			} else if (dynamic.collection.length > 0) return filterUserCollection(dynamic.collection)

			// Transition day and night with noon & evening collections
			// if clock is + /- 60 min around sunrise/set
			if (init && init.weather) {
				const weather = init.weather
				const minutator = (date) => date.getHours() * 60 + date.getMinutes()

				const { sunset, sunrise } = weather.lastState.sys,
					minsunrise = minutator(new Date(sunrise * 1000)),
					minsunset = minutator(new Date(sunset * 1000)),
					sunnow = minutator(new Date())

				if (sunnow >= 0 && sunnow <= minsunrise - 60) return 'night'
				else if (sunnow <= minsunrise + 60) return 'noon'
				else if (sunnow <= minsunset - 60) return 'day'
				else if (sunnow <= minsunset + 60) return 'evening'
				else if (sunnow >= minsunset + 60) return 'night'
				else return 'day'
			} else return 'day'
		}

		// 4
		function requestNewList(collection, callback) {
			const header = new Headers()
			const collecId = collectionsIds[collection] || collectionsIds.day
			const url = `https://api.unsplash.com/photos/random?collections=${collecId}&count=8&orientation=landscape`
			header.append('Authorization', `Client-ID 3686c12221d29ca8f7947c94542025d760a8e0d49007ec70fa2c4b9f9d377b1d`)
			header.append('Accept-Version', 'v1')

			fetch(url, { headers: header }).then((raw) =>
				raw.json().then((imgArray) => {
					const filteredList = []

					imgArray.forEach((img) => {
						filteredList.push({
							url: img.urls.raw + '&w=' + screen.width + '&dpr=' + window.devicePixelRatio,
							link: img.links.html,
							username: img.user.username,
							name: img.user.name,
							city: img.location.city,
							country: img.location.country,
							color: img.color,
						})
					})

					callback(filteredList)
				})
			)
		}

		const collectionName = chooseCollection()
		let list = local[collectionName]

		// Startup, nothing in cache
		if (list.length === 0) {
			requestNewList(collectionName, (newlist) => {
				//
				// Save List
				local[collectionName] = newlist
				chrome.storage.local.set({ dynamicCache: local })

				loadBackground(newlist[0])

				//preload first background
				noDisplayImgLoad(newlist[1].url)
			})

			return true
		}

		// Test if same collection
		if (collectionName === local.current) {
			//
			// Need new image
			if (freqControl('get', dynamic.every, dynamic.time)) {
				//
				// removes previous image from list
				list.shift()

				// Load new image
				loadBackground(list[0])

				// If end of cache, get & save new list
				// Or only save bumped .at
				if (list.length === 1)
					requestNewList(collectionName, (newlist) => {
						//
						// Save newlist
						list = list.concat(newlist)
						local[collectionName] = list
						chrome.storage.local.set({ dynamicCache: local })

						// Preload third after newlist found
						noDisplayImgLoad(list[1].url, () => {
							local[collectionName] = list
							chrome.storage.local.set({ dynamicCache: local })
						})
					})
				//
				// Preload third
				else
					noDisplayImgLoad(list[1].url, () => {
						local[collectionName] = list
						chrome.storage.local.set({ dynamicCache: local })
					})

				// Update time
				if (dynamic.every !== 'tabs') {
					dynamic.time = freqControl('set', dynamic.every)
					chrome.storage.sync.set({ dynamic: dynamic })
				}
			}

			// No need for new, load the same image
			else loadBackground(list[0])
		}

		// Collection has changed !
		else {
			//
			// New collection already cached, get second image
			// If not, get image from previous collection
			if (list.length > 0) loadBackground(list[0])
			else local[local.current][0]

			// Save new collection
			dynamic.time = freqControl('set', dynamic.every)
			local.current = collectionName

			chrome.storage.sync.set({ dynamic: dynamic })
			chrome.storage.local.set({ dynamicCache: local })
		}
	}

	const collectionsIds = {
		noon: 'yDjgRh1iqkQ',
		day: '4933370',
		evening: '2nVzlQADDIE',
		night: 'VI5sx2SDQUg',
		user: '',
	}

	// 1
	// Startup
	if (init && init.dynamic) {
		chrome.storage.local.get('dynamicCache', (local) => cacheControl(init.dynamic, local.dynamicCache))
	}

	// Settings event
	else if (event) {
		chrome.storage.sync.get('dynamic', (data) => {
			//
			// Saves corresponding event
			if (event.every) data.dynamic.every = event.every

			// Apply unsplash again for new collection
			if (event.collection !== undefined) {
				data.dynamic.collection = event.collection

				chrome.storage.local.get('dynamicCache', (local) => {
					//
					// Resets previous user cache
					local.dynamicCache.user = []
					chrome.storage.local.set({ dynamicCache: local })

					cacheControl(data.dynamic, local.dynamicCache)
				})
			}

			chrome.storage.sync.set({ dynamic: data.dynamic })
		})
	}

	// First startup
	else {
		const sync = { every: 'tabs', time: 0, collection: '' },
			local = {
				current: 'day',
				noon: [],
				day: [],
				evening: [],
				night: [],
				user: [],
			}

		chrome.storage.local.set({ dynamicCache: local })
		chrome.storage.sync.set({ dynamic: sync })

		cacheControl(sync, local)
	}
}

function filter(cat, val) {
	let result = ''

	switch (cat) {
		case 'init':
			result = `blur(${val[0]}px) brightness(${val[1]})`
			break

		case 'blur':
			result = `blur(${val}px) brightness(${id('i_bright').value})`
			break

		case 'bright':
			result = `blur(${id('i_blur').value}px) brightness(${val})`
			break
	}

	id('background').style.filter = result
}

function darkmode(choice, init) {
	//
	function apply(val, weather) {
		//
		function auto() {
			if (weather === undefined) return 'autodark'

			//compare current hour with weather sunset / sunrise
			const ls = weather.lastState
			const sunrise = new Date(ls.sys.sunrise * 1000).getHours()
			const sunset = new Date(ls.sys.sunset * 1000).getHours()
			const hr = new Date().getHours()

			return hr <= sunrise || hr > sunset ? 'dark' : ''
		}

		let bodyClass

		switch (val) {
			case 'system':
				bodyClass = 'autodark'
				break

			case 'auto':
				bodyClass = auto()
				break

			case 'enable':
				bodyClass = 'dark'
				break

			case 'disable':
				bodyClass = ''
				break

			default:
				bodyClass = 'autodark'
		}

		document.body.setAttribute('class', bodyClass)
		if (choice) chrome.storage.sync.set({ dark: choice })
	}

	if (choice) chrome.storage.sync.get('weather', (data) => apply(choice, data.weather))
	else apply(init.dark, init.weather)
}

function searchbar(event, that, storage) {
	function display(value, init) {
		id('sb_container').setAttribute('class', value ? 'shown' : 'hidden')

		if (!init) chrome.storage.sync.set({ searchbar: value })
	}

	function localisation(q) {
		let response = '',
			lang = document.documentElement.getAttribute('lang'),
			engine = domsearchbar.getAttribute('engine')

		// engineLocales est dans lang.js
		response = engineLocales[engine].base.replace('$locale$', engineLocales[engine][lang]).replace('$query$', q)

		return response
	}

	function engine(value, init) {
		const names = {
			startpage: 'Startpage',
			ddg: 'DuckDuckGo',
			qwant: 'Qwant',
			lilo: 'Lilo',
			ecosia: 'Ecosia',
			google: 'Google',
			yahoo: 'Yahoo',
			bing: 'Bing',
		}

		if (!init) chrome.storage.sync.set({ searchbar_engine: value })

		domsearchbar.setAttribute('placeholder', tradThis('Search on ' + names[value]))
		domsearchbar.setAttribute('engine', value)
	}

	function setNewtab(value, init) {
		if (!init) chrome.storage.sync.set({ searchbar_newtab: value })
		domsearchbar.setAttribute('newtab', value)
	}

	const domsearchbar = id('searchbar')

	domsearchbar.onkeyup = function (e) {
		const isNewtab = e.target.getAttribute('newtab') === 'true'

		if (e.key === 'Enter') {
			if (isNewtab) window.open(localisation(this.value), '_blank')
			else window.location = localisation(this.value)
		}
	}

	if (event) {
		if (event === 'searchbar') display(that.checked)
		if (event === 'engine') engine(that.value)
		if (event === 'newtab') setNewtab(that.checked)
	}
	//init
	else {
		const searchbar = storage.searchbar || false,
			searchengine = storage.searchbar_engine || 'google',
			searchbarnewtab = storage.searchbar_newtab || false

		//display
		display(searchbar, true)
		engine(searchengine.replace('s_', ''), true)
		setNewtab(searchbarnewtab, true)

		// 1.9.2 ==> 1.9.3 lang breaking fix
		if (storage.searchbar_engine) {
			chrome.storage.sync.set({ searchbar_engine: searchengine.replace('s_', '') })
		}
	}
}

function showPopup(data) {
	const popup = id('popup')
	const closePopup = id('closePopup')
	const go = id('go')

	go.setAttribute(
		'href',
		navigator.userAgent.includes('Chrome')
			? 'https://chrome.google.com/webstore/detail/bonjourr-%C2%B7-minimalist-lig/dlnejlppicbjfcfcedcflplfjajinajd/reviews'
			: 'https://addons.mozilla.org/en-US/firefox/addon/bonjourr-startpage/'
	)

	//s'affiche après 30 tabs
	if (data > 30) {
		const close = function () {
			popup.classList.replace('shown', 'removing')
			chrome.storage.sync.set({ reviewPopup: 'removed' })
		}

		popup.classList.add('shown')

		closePopup.onclick = close
		go.onclick = close
	} else if (typeof data === 'number') chrome.storage.sync.set({ reviewPopup: data + 1 })
	else if (data !== 'removed') chrome.storage.sync.set({ reviewPopup: 0 })
	else if (data === 'removed') document.body.removeChild(popup)
}

function modifyWeightOptions(weights) {
	const doms = document.querySelectorAll('#i_weight option')

	// Pas de weights, 400
	if (!weights) {
		id('i_weight').value = '400'
		weights = ['400']
	}

	// ya des weights, transforme regular en 400
	else {
		if (weights.includes('regular')) {
			weights[weights.indexOf('regular')] = '400'
		}
	}

	if (doms) {
		doms.forEach((option) => {
			if (weights.includes(option.value)) option.style.display = 'block'
			else option.style.display = 'none'
		})
	}
}

function customSize(init, event) {
	const apply = (size) => (dominterface.style.fontSize = size + 'px')
	const save = () => {
		chrome.storage.sync.get('font', (data) => {
			let font = data.font || { family: '', weight: '400', size: 13 }
			font.size = event
			slowRange({ font: font }, 200)
		})
	}

	if (init) apply(init.size)
	else apply(event)

	if (event) save()
}

function customFont(data, event) {
	const save = (url, family, availWeights, weight) => {
		chrome.storage.sync.get('font', (data) => {
			const font = data.font || {}

			font.url = url
			font.family = family
			font.availWeights = availWeights
			font.weight = weight

			slowRange({ font: font }, 200)
		})
	}

	// Fetches fonts.google.com url
	function apply(url, family, weight) {
		fetch(url)
			.then((response) => response.text())
			.then((text) => {
				text = text.replace(/(\r\n|\n|\r|  )/gm, '')
				id('fontstyle').innerText = text
				id('clock').style.fontFamily = family
				dominterface.style.fontFamily = family
				dominterface.style.fontWeight = weight

				canDisplayInterface('fonts')
			})
	}

	// Event only
	// Uses already saved url, replaces weight from url and apply / save
	function changeWeight(val, font) {
		if (font.url) {
			font.url = font.url.slice(0, font.url.lastIndexOf(':') + 1)
			font.url += val

			apply(font.url, font.family, val)
			save(font.url, font.family, font.availWeights, val)
		}
	}

	// Event only
	function changeFamily(json) {
		//
		// Cherche correspondante
		const dom = id('i_customfont')
		const font = json.items.filter((font) => font.family.toUpperCase() === dom.value.toUpperCase())

		// One font has been found
		if (font.length > 0) {
			const url = `https://fonts.googleapis.com/css?family=${font[0].family}:400`
			const availWeights = font[0].variants.filter((variant) => !variant.includes('italic'))

			// Change l'url, et les weight options
			apply(url, font[0].family, '400')
			save(url, font[0].family, availWeights, '400')
			modifyWeightOptions(availWeights)

			dom.blur()
			dom.setAttribute('placeholder', 'Any Google fonts')
		} else {
			dom.value = ''
			dom.setAttribute('placeholder', 'No fonts matched')
		}
	}

	// init
	if (data) {
		if (data.family && data.url) {
			apply(data.url, data.family, data.weight || '400')
		}
	}

	// event
	if (event) {
		// If nothing, removes custom font
		if (event.family === '') {
			id('fontstyle').innerText = ''
			dominterface.style.fontFamily = ''
			dominterface.style.fontWeight = ''
			id('clock').style.fontFamily = ''

			modifyWeightOptions()

			save()
			return false
		}

		if (event.weight) {
			chrome.storage.sync.get('font', (data) => changeWeight(event.weight, data.font))
			return false
		}

		// If there is something
		if (Object.entries(googleFontList).length === 0) {
			// Liste toute les fonts
			fetch('https://www.googleapis.com/webfonts/v1/webfonts?key=AIzaSyAky3JYc2rCOL1jIssGBgLr1PT4yW15jOk')
				.then((response) => response.json())
				.then((json) => {
					googleFontList = json
					changeFamily(json)
				})
		} else {
			changeFamily(googleFontList)
		}
	}
}

function customCss(init, event) {
	const styleHead = id('styles')

	if (init) styleHead.innerText = init

	if (event) {
		//const e = event.e
		// const that = event.that
		// syntaxControl(e, that)

		const val = id('cssEditor').value
		styleHead.innerText = val
		slowRange({ css: val }, 500)
	}
}

function linksrow(data, event) {
	function setRows(val) {
		domlinkblocks.style.width = `${val * 7}em`
	}

	if (data !== undefined) setRows(data)

	if (event) {
		//id("e_row").innerText = event;
		setRows(event)
		slowRange({ linksrow: parseInt(event) })
	}
}

function greetingName(data, event) {
	let text = id('greetings').innerText
	let pause

	function apply(val) {
		//greeting is classic text + , + custom greet
		id('greetings').innerText = `${text}, ${val}`

		//input empty removes ,
		if (val === '') id('greetings').innerText = text
	}

	function setEvent(val) {
		const virgule = text.indexOf(',')

		//remove last input from greetings
		text = text.slice(0, virgule === -1 ? text.length : virgule)
		apply(val)

		//reset save timeout
		//wait long enough to save to storage
		if (pause) clearTimeout(pause)

		pause = setTimeout(function () {
			chrome.storage.sync.set({ greeting: val })
		}, 1200)
	}

	//init
	if (data !== undefined) apply(data)
	if (event !== undefined) setEvent(event)
}

function hideElem(init, buttons, that) {
	const IDsList = [
		['time', ['time-container', 'date']],
		['main', ['greetings', 'weather_desc', 'w_icon']],
		['linkblocks', ['linkblocks']],
		['showSettings', ['showSettings']],
	]

	// Returns { row, col } to naviguate [[0, 0], [0, 0, 0]] etc.
	function getEventListPosition(that) {
		return { row: parseInt(that.getAttribute('he_row')), col: parseInt(that.getAttribute('he_col')) }
	}

	function toggleElement(dom, hide) {
		if (hide) id(dom).classList.add('he_hidden')
		else id(dom).classList.remove('he_hidden')
	}

	function isEverythingHidden(list, row) {
		const filtered = list[row].filter((el) => el === 1)
		return filtered.length === list[row].length
	}

	function initializeHiddenElements(list, animonly) {
		list.forEach((row, row_i) => {
			const parent = IDsList[row_i][0]

			animonly ? id(parent).classList.add('he_anim') : isEverythingHidden(list, row_i) ? toggleElement(parent, true) : ''

			// Hide children
			row.forEach((child, child_i) => {
				const childid = IDsList[row_i][1][child_i]

				animonly ? id(childid).classList.add('he_anim') : child === 1 ? toggleElement(childid, true) : ''
			})
		})
	}

	function updateToNewData(list) {
		if (list[0]) {
			if (typeof list[0][0] === 'string') {
				//
				// Flattens and removes parent IDs
				const childOnly = IDsList.flat().filter((row) => typeof row === 'object')
				let newHidden = [[0, 0], [0, 0, 0], [0], [0]]

				//
				// Go through IDs list for every old hide elems
				list.forEach((id) => {
					childOnly.forEach((row, row_i) =>
						row.forEach((col, col_i) => {
							if (col === id) {
								newHidden[row_i][col_i] = 1
							}
						})
					)
				})

				chrome.storage.sync.set({ hide: newHidden })
				return newHidden
			}

			// Is already updated
			else return list
		}

		// Had nothing to hide
		else return list
	}

	// startup initialization
	if (!that && !buttons) {
		//
		// first startup
		if (!init) {
			chrome.storage.sync.set({ hide: [[0, 0], [0, 0, 0], [0], [0]] })
			return false
		}

		initializeHiddenElements(updateToNewData(init))
		setTimeout(() => initializeHiddenElements(init, true), BonjourrAnimTime)
	}

	// Settings buttons initialization
	else if (buttons) {
		chrome.storage.sync.get('hide', (data) => {
			//
			// 1.9.3 ==> 1.10.0
			data.hide = updateToNewData(data.hide)

			buttons.forEach((button) => {
				const pos = getEventListPosition(button)
				if (data.hide[pos.row][pos.col] === 1) button.classList.toggle('clicked')
			})
		})
	}

	// Event
	else {
		chrome.storage.sync.get('hide', (data) => {
			//
			// 1.9.3 ==> 1.10.0
			data.hide = updateToNewData(data.hide)

			const pos = getEventListPosition(that)
			const state = that.classList.contains('clicked')
			const child = IDsList[pos.row][1][pos.col]
			const parent = IDsList[pos.row][0]

			// Update hidden list
			data.hide[pos.row][pos.col] = state ? 1 : 0
			chrome.storage.sync.set({ hide: data.hide })

			// Toggle children and parent if needed
			toggleElement(child, state)
			toggleElement(parent, isEverythingHidden(data.hide, pos.row))
		})
	}
}

function canDisplayInterface(cat) {
	funcsOk[cat] = true
	const res = Object.values(funcsOk).filter((val) => val === true)
	const keys = Object.keys(funcsOk)

	// Everything ready
	// Progressive anim to max of Bonjourr animation time
	if (res.length === keys.length) {
		let loadtime = performance.now() - loadtimeStart

		if (loadtime > BonjourrAnimTime) loadtime = BonjourrAnimTime
		if (loadtime < 30) loadtime = 0

		dominterface.style.transition = `opacity ${loadtime}ms, transform .2s`
		domshowsettings.style.transition = `opacity ${loadtime}ms`

		dominterface.style.opacity = '1'
		domshowsettings.style.opacity = '1'
	}
}

window.onload = function () {
	try {
		chrome.storage.sync.get(null, (data) => {
			//
			// Compatibility with older local versions
			// As it is now using "bonjourr" key
			if (!chrome && localStorage.data && !localStorage.bonjourr) {
				localStorage.bonjourr = atob(localStorage.data)
				localStorage.removeItem('data')
			}

			const h = new Date().getHours()

			// Can display interface added conditions
			if (data.font) if (data.font.family && data.font.url) funcsOk.fonts = false
			if (h < 12 || h > 21) funcsOk.weatherhigh = false

			traduction(null, data.lang)
			weather(null, null, data)
			greetings()
			date(null, data.usdate)
			newClock(null, data.clock)
			darkmode(null, data)
			initBackground(data)
			searchbar(null, null, data)
			showPopup(data.reviewPopup)

			customSize(data.font)
			customFont(data.font)
			customCss(data.css)
			hideElem(data.hide)

			linksrow(data.linksrow)
			quickLinks(null, null, data)

			greetingName(data.greeting)

			//safe font for different alphabet
			if (data.lang === 'ru' || data.lang === 'sk') {
				const safeFont = () =>
					(id('styles').innerText = `
			body, #settings, #settings h5 {font-family: Helvetica, Calibri}`)

				if (!data.font) safeFont()
				else if (data.font.family === '') safeFont()
			}

			if (mobilecheck) {
				dominterface.style.minHeight = '90vh'
				dominterface.style.padding = '0 0 10vh 0'
			}
		})
	} catch (error) {
		prompt(`Bonjourr messed up 😭😭 Copy this message and contact us !`, error.stack, error.line)
	}
}
