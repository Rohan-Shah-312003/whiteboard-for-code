const vscode = acquireVsCodeApi();
const canvas = document.getElementById("canvas");
const gridCanvas = document.getElementById("gridCanvas");
const ctx = canvas.getContext("2d");
const gridCtx = gridCanvas.getContext("2d");

// State
let elements = [];
let currentElement = null;
let isDrawing = false;
let currentTool = "pen";
let currentColor = "#51ff00ff";
let strokeWidth = 6;
let viewOffset = { x: 0, y: 0 };
let zoom = 1;
let isPanning = false;
let lastPanPoint = { x: 0, y: 0 };
let history = [];
let historyStep = -1;
let erasedInCurrentStroke = new Set();

// Predefined color palette
const colorPalette = [
	"#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff",
	"#ffff00", "#ff00ff", "#00ffff", "#ff8800", "#8800ff",
	"#ff0088", "#88ff00", "#0088ff", "#808080", "#ff6b6b"
];

// Initialize
function init() {
	resizeCanvas();
	drawGrid();
	setupEventListeners();
	createColorPalette();
	requestState();
	updateUI();

	window.addEventListener("resize", () => {
		resizeCanvas();
		drawGrid();
		render();
	});
}

function resizeCanvas() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	gridCanvas.width = window.innerWidth;
	gridCanvas.height = window.innerHeight;
}

function drawGrid() {
	gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
	gridCtx.strokeStyle = "#ddd";
	gridCtx.lineWidth = 1;

	const gridSize = 20 * zoom;
	const offsetX = viewOffset.x % gridSize;
	const offsetY = viewOffset.y % gridSize;

	for (let x = offsetX; x < gridCanvas.width; x += gridSize) {
		gridCtx.beginPath();
		gridCtx.moveTo(x, 0);
		gridCtx.lineTo(x, gridCanvas.height);
		gridCtx.stroke();
	}

	for (let y = offsetY; y < gridCanvas.height; y += gridSize) {
		gridCtx.beginPath();
		gridCtx.moveTo(0, y);
		gridCtx.lineTo(gridCanvas.width, y);
		gridCtx.stroke();
	}
}

function createColorPalette() {
	const paletteContainer = document.getElementById("colorPalette");
	if (!paletteContainer) {
		console.warn("Color palette container not found. Add <div id='colorPalette'></div> to your HTML");
		return;
	}

	// Style the palette container
	paletteContainer.style.position = "absolute";
	paletteContainer.style.top = "45px";
	paletteContainer.style.left = "0";
	paletteContainer.style.background = "#fff";
	paletteContainer.style.border = "1px solid #e0e0e0";
	paletteContainer.style.borderRadius = "8px";
	paletteContainer.style.padding = "8px";
	paletteContainer.style.display = "none";
	paletteContainer.style.flexWrap = "wrap";
	paletteContainer.style.width = "180px";
	paletteContainer.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
	paletteContainer.style.zIndex = "1000";

	colorPalette.forEach(color => {
		const swatch = document.createElement("div");
		swatch.className = "color-swatch";
		swatch.style.backgroundColor = color;
		swatch.style.width = "28px";
		swatch.style.height = "28px";
		swatch.style.borderRadius = "4px";
		swatch.style.cursor = "pointer";
		swatch.style.border = "2px solid transparent";
		swatch.style.display = "inline-block";
		swatch.style.margin = "2px";
		swatch.title = color;
		
		if (color === currentColor || color === currentColor.substring(0, 7)) {
			swatch.classList.add("active");
			swatch.style.border = "2px solid #333";
			swatch.style.boxShadow = "0 0 0 2px #fff, 0 0 0 4px #333";
		}
		
		swatch.addEventListener("click", () => {
			currentColor = color;
			document.querySelectorAll(".color-swatch").forEach(s => {
				s.classList.remove("active");
				s.style.border = "2px solid transparent";
				s.style.boxShadow = "none";
			});
			swatch.classList.add("active");
			swatch.style.border = "2px solid #333";
			swatch.style.boxShadow = "0 0 0 2px #fff, 0 0 0 4px #333";
			
			const colorDisplay = document.getElementById("colorDisplay");
			if (colorDisplay) colorDisplay.style.background = color;
			
			// Close palette after selection
			paletteContainer.style.display = "none";
		});
		
		paletteContainer.appendChild(swatch);
	});

	// Toggle palette when clicking color display
	const colorDisplay = document.getElementById("colorDisplay");
	if (colorDisplay) {
		colorDisplay.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = paletteContainer.style.display === "flex";
			paletteContainer.style.display = isVisible ? "none" : "flex";
		});
	}

	// Close palette when clicking outside
	document.addEventListener("click", (e) => {
		if (!paletteContainer.contains(e.target) && e.target !== colorDisplay) {
			paletteContainer.style.display = "none";
		}
	});
}

function setupEventListeners() {
	// Tool buttons
	document.querySelectorAll("[data-tool]").forEach((btn) => {
		btn.addEventListener("click", () => {
			document
				.querySelectorAll("[data-tool]")
				.forEach((b) => b.classList.remove("active"));
			btn.classList.add("active");
			currentTool = btn.dataset.tool;
			updateCursor();
		});
	});

	// Color display (no separate picker needed)
	const colorDisplay = document.getElementById("colorDisplay");
	if (colorDisplay) {
		colorDisplay.style.background = currentColor;
	}

	// Stroke width
	const strokeSlider = document.getElementById("strokeWidth");
	const sizeDisplay = document.getElementById("sizeDisplay");

	strokeSlider.addEventListener("input", (e) => {
		strokeWidth = parseInt(e.target.value);
		sizeDisplay.textContent = strokeWidth;
	});

	// Canvas events
	canvas.addEventListener("mousedown", handleMouseDown);
	canvas.addEventListener("mousemove", handleMouseMove);
	canvas.addEventListener("mouseup", handleMouseUp);
	canvas.addEventListener("mouseleave", handleMouseUp);
	canvas.addEventListener("wheel", handleWheel, {
		passive: false,
	});

	// Touch events
	canvas.addEventListener("touchstart", handleTouchStart, {
		passive: false,
	});
	canvas.addEventListener("touchmove", handleTouchMove, {
		passive: false,
	});
	canvas.addEventListener("touchend", handleTouchEnd, {
		passive: false,
	});

	// Keyboard shortcuts
	document.addEventListener("keydown", handleKeyDown);

	// VS Code messages
	window.addEventListener("message", handleMessage);
}

function updateCursor() {
	if (currentTool === "hand") {
		canvas.classList.add("hand-cursor");
	} else {
		canvas.classList.remove("hand-cursor");
		canvas.style.cursor =
			currentTool === "eraser" ? "not-allowed" : "crosshair";
	}
}

function getMousePos(e) {
	const rect = canvas.getBoundingClientRect();
	return {
		x: (e.clientX - rect.left - viewOffset.x) / zoom,
		y: (e.clientY - rect.top - viewOffset.y) / zoom,
	};
}

function handleMouseDown(e) {
	const pos = getMousePos(e);

	if (currentTool === "hand") {
		isPanning = true;
		lastPanPoint = { x: e.clientX, y: e.clientY };
		return;
	}

	if (currentTool === "eraser") {
		isDrawing = true;
		eraseAtPoint(pos.x, pos.y);
		return;
	}

	isDrawing = true;

	currentElement = {
		id: Date.now().toString(),
		type: currentTool,
		color: currentColor,
		strokeWidth: strokeWidth,
		points: currentTool === "pen" ? [pos] : undefined,
		x: pos.x,
		y: pos.y,
		width: 0,
		height: 0,
	};
}

function handleMouseMove(e) {
	if (isPanning) {
		const dx = e.clientX - lastPanPoint.x;
		const dy = e.clientY - lastPanPoint.y;

		viewOffset.x += dx;
		viewOffset.y += dy;

		lastPanPoint = { x: e.clientX, y: e.clientY };

		drawGrid();
		render();
		return;
	}

	if (!isDrawing) return;

	const pos = getMousePos(e);

	if (currentTool === "eraser") {
		eraseAtPoint(pos.x, pos.y);
		return;
	}

	if (currentTool === "pen" && currentElement) {
		currentElement.points.push(pos);
	} else if (currentElement) {
		currentElement.width = pos.x - currentElement.x;
		currentElement.height = pos.y - currentElement.y;
	}

	render();
}

function handleMouseUp(e) {
	if (isPanning) {
		isPanning = false;
		return;
	}

	if (!isDrawing) return;
	isDrawing = false;

	if (currentTool === "eraser") {
		// Reset the erased set for next stroke
		erasedInCurrentStroke.clear();
		addToHistory();
		saveState();
		return;
	}

	if (currentElement) {
		elements.push(currentElement);
		addToHistory();
		currentElement = null;
	}

	render();
	saveState();
}

function handleWheel(e) {
	e.preventDefault();

	const delta = e.deltaY > 0 ? 0.9 : 1.1;
	const newZoom = Math.min(Math.max(zoom * delta, 0.1), 5);

	const rect = canvas.getBoundingClientRect();
	const mouseX = e.clientX - rect.left;
	const mouseY = e.clientY - rect.top;

	viewOffset.x = mouseX - (mouseX - viewOffset.x) * (newZoom / zoom);
	viewOffset.y = mouseY - (mouseY - viewOffset.y) * (newZoom / zoom);

	zoom = newZoom;

	drawGrid();
	render();
	updateZoomDisplay();
}

function handleTouchStart(e) {
	e.preventDefault();
	const touch = e.touches[0];
	const mouseEvent = new MouseEvent("mousedown", {
		clientX: touch.clientX,
		clientY: touch.clientY,
	});
	canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
	e.preventDefault();
	const touch = e.touches[0];
	const mouseEvent = new MouseEvent("mousemove", {
		clientX: touch.clientX,
		clientY: touch.clientY,
	});
	canvas.dispatchEvent(mouseEvent);
}

function handleTouchEnd(e) {
	e.preventDefault();
	const mouseEvent = new MouseEvent("mouseup", {});
	canvas.dispatchEvent(mouseEvent);
}

function handleKeyDown(e) {
	if (e.ctrlKey || e.metaKey) {
		if (e.key === "z") {
			e.preventDefault();
			undo();
		} else if (e.key === "y") {
			e.preventDefault();
			redo();
		}
	}

	const toolMap = {
		h: "hand",
		p: "pen",
		e: "eraser",
		l: "line",
		a: "arrow",
		r: "rectangle",
		c: "circle",
	};

	if (toolMap[e.key.toLowerCase()]) {
		currentTool = toolMap[e.key.toLowerCase()];
		document.querySelectorAll("[data-tool]").forEach((btn) => {
			btn.classList.toggle("active", btn.dataset.tool === currentTool);
		});
		updateCursor();
	}
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
	const A = px - x1;
	const B = py - y1;
	const C = x2 - x1;
	const D = y2 - y1;

	const dot = A * C + B * D;
	const lenSq = C * C + D * D;
	let param = -1;

	if (lenSq !== 0) param = dot / lenSq;

	let xx, yy;

	if (param < 0) {
		xx = x1;
		yy = y1;
	} else if (param > 1) {
		xx = x2;
		yy = y2;
	} else {
		xx = x1 + param * C;
		yy = y1 + param * D;
	}

	const dx = px - xx;
	const dy = py - yy;
	return Math.sqrt(dx * dx + dy * dy);
}

function isPointInRectangle(px, py, el, threshold) {
	const minX = Math.min(el.x, el.x + el.width) - threshold;
	const maxX = Math.max(el.x, el.x + el.width) + threshold;
	const minY = Math.min(el.y, el.y + el.height) - threshold;
	const maxY = Math.max(el.y, el.y + el.height) + threshold;

	if (px < minX || px > maxX || py < minY || py > maxY) return false;

	// Check distance to each edge
	const edges = [
		[el.x, el.y, el.x + el.width, el.y],
		[el.x + el.width, el.y, el.x + el.width, el.y + el.height],
		[el.x + el.width, el.y + el.height, el.x, el.y + el.height],
		[el.x, el.y + el.height, el.x, el.y]
	];

	return edges.some(([x1, y1, x2, y2]) => 
		distanceToLineSegment(px, py, x1, y1, x2, y2) <= threshold
	);
}

function eraseAtPoint(x, y) {
	const eraseRadius = strokeWidth * 2;
	let somethingErased = false;
	
	elements = elements.filter((el) => {
		// Skip if already erased in this stroke
		if (erasedInCurrentStroke.has(el.id)) {
			return false;
		}

		let shouldErase = false;

		switch (el.type) {
			case "pen":
				// Check if any line segment of the pen stroke is within erase radius
				if (!el.points || el.points.length < 2) break;
				
				for (let i = 0; i < el.points.length - 1; i++) {
					const p1 = el.points[i];
					const p2 = el.points[i + 1];
					const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
					if (dist <= eraseRadius + el.strokeWidth / 2) {
						shouldErase = true;
						break;
					}
				}
				break;

			case "line":
			case "arrow":
				const dist = distanceToLineSegment(
					x, y, 
					el.x, el.y, 
					el.x + el.width, el.y + el.height
				);
				shouldErase = dist <= eraseRadius + el.strokeWidth / 2;
				break;

			case "rectangle":
				shouldErase = isPointInRectangle(x, y, el, eraseRadius + el.strokeWidth / 2);
				break;

			case "circle":
				const centerX = el.x;
				const centerY = el.y;
				const radius = Math.sqrt(el.width * el.width + el.height * el.height) / 2;
				const distToCenter = Math.sqrt(
					Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
				);
				const distToCircle = Math.abs(distToCenter - radius);
				shouldErase = distToCircle <= eraseRadius + el.strokeWidth / 2;
				break;
		}

		if (shouldErase) {
			erasedInCurrentStroke.add(el.id);
			somethingErased = true;
			return false;
		}

		return true;
	});

	if (somethingErased) {
		render();
	}
}

function render() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.save();
	ctx.translate(viewOffset.x, viewOffset.y);
	ctx.scale(zoom, zoom);

	elements.forEach((el) => drawElement(el));

	if (currentElement) {
		drawElement(currentElement);
	}

	ctx.restore();

	updateElementCounter();
}

function drawElement(el) {
	ctx.strokeStyle = el.color;
	ctx.fillStyle = el.color;
	ctx.lineWidth = el.strokeWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	switch (el.type) {
		case "pen":
			if (el.points && el.points.length > 1) {
				ctx.beginPath();
				ctx.moveTo(el.points[0].x, el.points[0].y);
				for (let i = 1; i < el.points.length; i++) {
					ctx.lineTo(el.points[i].x, el.points[i].y);
				}
				ctx.stroke();
			}
			break;

		case "line":
			ctx.beginPath();
			ctx.moveTo(el.x, el.y);
			ctx.lineTo(el.x + el.width, el.y + el.height);
			ctx.stroke();
			break;

		case "arrow":
			drawArrow(el);
			break;

		case "rectangle":
			ctx.beginPath();
			ctx.rect(el.x, el.y, el.width, el.height);
			ctx.stroke();
			break;

		case "circle":
			const radius =
				Math.sqrt(el.width * el.width + el.height * el.height) / 2;
			ctx.beginPath();
			ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
			ctx.stroke();
			break;
	}
}

function drawArrow(el) {
	const x1 = el.x;
	const y1 = el.y;
	const x2 = el.x + el.width;
	const y2 = el.y + el.height;

	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();

	const angle = Math.atan2(y2 - y1, x2 - x1);
	const arrowSize = 15;

	ctx.beginPath();
	ctx.moveTo(x2, y2);
	ctx.lineTo(
		x2 - arrowSize * Math.cos(angle - Math.PI / 6),
		y2 - arrowSize * Math.sin(angle - Math.PI / 6)
	);
	ctx.moveTo(x2, y2);
	ctx.lineTo(
		x2 - arrowSize * Math.cos(angle + Math.PI / 6),
		y2 - arrowSize * Math.sin(angle + Math.PI / 6)
	);
	ctx.stroke();
}

function addToHistory() {
	historyStep++;
	history = history.slice(0, historyStep);
	history.push(JSON.parse(JSON.stringify(elements)));
}

function undo() {
	if (historyStep > 0) {
		historyStep--;
		elements = JSON.parse(JSON.stringify(history[historyStep]));
		render();
		saveState();
	}
}

function redo() {
	if (historyStep < history.length - 1) {
		historyStep++;
		elements = JSON.parse(JSON.stringify(history[historyStep]));
		render();
		saveState();
	}
}

function clearAll() {
	if (confirm("Clear all elements?")) {
		elements = [];
		addToHistory();
		render();
		saveState();
	}
}

function zoomIn() {
	zoom = Math.min(zoom * 1.2, 5);
	drawGrid();
	render();
	updateZoomDisplay();
}

function zoomOut() {
	zoom = Math.max(zoom / 1.2, 0.1);
	drawGrid();
	render();
	updateZoomDisplay();
}

function resetZoom() {
	zoom = 1;
	viewOffset = { x: 0, y: 0 };
	drawGrid();
	render();
	updateZoomDisplay();
}

function updateZoomDisplay() {
	document.getElementById("zoomDisplay").textContent =
		Math.round(zoom * 100) + "%";
}

function updateElementCounter() {
	document.getElementById("elementCounter").textContent =
		elements.length + " element" + (elements.length !== 1 ? "s" : "");
}

function exportImage() {
	const link = document.createElement("a");
	link.download =
		"whiteboard-" + new Date().toISOString().slice(0, 10) + ".png";

	const tempCanvas = document.createElement("canvas");
	tempCanvas.width = canvas.width;
	tempCanvas.height = canvas.height;
	const tempCtx = tempCanvas.getContext("2d");

	tempCtx.fillStyle = "#ffffff";
	tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
	tempCtx.drawImage(canvas, 0, 0);

	link.href = tempCanvas.toDataURL();
	link.click();
}

function saveState() {
	const state = {
		elements: elements,
		viewOffset: viewOffset,
		zoom: zoom,
		lastModified: Date.now(),
	};

	vscode.postMessage({
		command: "saveState",
		data: state,
	});
}

function requestState() {
	vscode.postMessage({ command: "getState" });
}

function handleMessage(event) {
	const message = event.data;

	switch (message.command) {
		case "loadState":
			if (message.state) {
				elements = message.state.elements || [];
				viewOffset = message.state.viewOffset || {
					x: 0,
					y: 0,
				};
				zoom = message.state.zoom || 1;

				history = [JSON.parse(JSON.stringify(elements))];
				historyStep = 0;

				drawGrid();
				render();
				updateZoomDisplay();
				updateUI();
			}
			break;

		case "requestSave":
			saveState();
			break;
	}
}

function updateUI() {
	const colorDisplay = document.getElementById("colorDisplay");
	if (colorDisplay) {
		colorDisplay.style.background = currentColor;
	}
	document.getElementById("strokeWidth").value = strokeWidth;
	document.getElementById("sizeDisplay").textContent = strokeWidth;
	updateZoomDisplay();
	updateElementCounter();
}

// Initialize everything
init();