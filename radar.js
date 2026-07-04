// radar.js
const decades = ['<1970', '1970er', '1980er', '1990er', '2000er', '2010er', '2020er'];
let radarValues = [100, 100, 100, 100, 100, 100, 100]; // 0 bis 100

const radarSize = 400;
const center = radarSize / 2;
const maxRadius = (radarSize / 2) - 30; // Platz für Text lassen

function drawRadar() {
    const svg = document.getElementById('radar-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Clear

    // Hintergrund-Gitter (7-Eck) zeichnen (Ringe bei 25%, 50%, 75%, 100%)
    [0.25, 0.5, 0.75, 1].forEach(level => {
        let points = decades.map((_, i) => {
            let angle = (Math.PI * 2 * i / 7) - (Math.PI / 2);
            let r = maxRadius * level;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
        }).join(' ');
        
        let polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", points);
        polygon.setAttribute("fill", "none");
        polygon.setAttribute("stroke", "rgba(255,255,255,0.2)");
        svg.appendChild(polygon);
    });

    // Achsen und Labels
    decades.forEach((label, i) => {
        let angle = (Math.PI * 2 * i / 7) - (Math.PI / 2);
        let x = center + maxRadius * Math.cos(angle);
        let y = center + maxRadius * Math.sin(angle);

        // Linie
        let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", center); line.setAttribute("y1", center);
        line.setAttribute("x2", x); line.setAttribute("y2", y);
        line.setAttribute("stroke", "rgba(255,255,255,0.3)");
        svg.appendChild(line);

        // Text
        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        
        // Radius für den Text (bisschen weiter außen als das Polygon)
        let textRadius = maxRadius + 15; 
        let textX = center + textRadius * Math.cos(angle);
        let textY = center + textRadius * Math.sin(angle);
        
        // Smarte Ausrichtung berechnen
        let cos = Math.cos(angle);
        let sin = Math.sin(angle);
        
        if (Math.abs(cos) < 0.1) {
            // Oben und Unten: Zentriert lassen
            text.setAttribute("text-anchor", "middle");
            textY += sin > 0 ? 12 : -8; // Unten etwas tiefer, oben etwas höher schieben
        } else if (cos > 0) {
            // Rechte Seite: Text wächst nach rechts außen!
            text.setAttribute("text-anchor", "start");
            textX += 5;
        } else {
            // Linke Seite: Text wächst nach links außen!
            text.setAttribute("text-anchor", "end");
            textX -= 5;
        }

        text.setAttribute("x", textX); 
        text.setAttribute("y", textY);
        text.setAttribute("fill", "#ccc");
        text.setAttribute("font-size", "16px"); // Schön lesbar
        text.setAttribute("alignment-baseline", "middle");
        
        // Relative Prozentzahl berechnen
        // Relative Prozentzahl berechnen
        let total = radarValues.reduce((a, b) => a + b, 0);
        let percent = total === 0 ? 0 : Math.round((radarValues[i] / total) * 100);
        
        // Erster Teil: Das Jahrzehnt (wird etwas nach oben geschoben)
        let tspanLabel = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspanLabel.setAttribute("x", textX);
        tspanLabel.setAttribute("dy", "-5"); // 5 Pixel nach oben
        tspanLabel.textContent = label;

        // Zweiter Teil: Die Prozentzahl (wird eine Zeile nach unten geschoben)
        let tspanPercent = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspanPercent.setAttribute("x", textX);
        tspanPercent.setAttribute("dy", "14"); // 14 Pixel nach unten (Zeilenumbruch)
        tspanPercent.setAttribute("fill", "#0088ff"); // Knallblau zur Hervorhebung
        tspanPercent.setAttribute("font-weight", "bold");
        tspanPercent.textContent = `${percent}%`;

        // Beide Teile in das Haupt-Textelement packen
        text.appendChild(tspanLabel);
        text.appendChild(tspanPercent);
        svg.appendChild(text);
    });

    // Das blaue Wert-Polygon
    let valuePoints = radarValues.map((val, i) => {
        let angle = (Math.PI * 2 * i / 7) - (Math.PI / 2);
        let r = maxRadius * (val / 100);
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');
    
    let valuePolygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    valuePolygon.setAttribute("points", valuePoints);
    valuePolygon.setAttribute("fill", "rgba(0, 136, 255, 0.4)");
    valuePolygon.setAttribute("stroke", "#0088ff");
    valuePolygon.setAttribute("stroke-width", "2");
    svg.appendChild(valuePolygon);

    // Interaktive Anfass-Punkte
    let pt = svg.createSVGPoint(); 

    radarValues.forEach((val, i) => {
        let angle = (Math.PI * 2 * i / 7) - (Math.PI / 2);
        let r = maxRadius * (val / 100);
        let cx = center + r * Math.cos(angle);
        let cy = center + r * Math.sin(angle);

        // --- 1. DER SICHTBARE PUNKT (Bleibt klein) ---
        let visibleCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        visibleCircle.setAttribute("cx", cx); 
        visibleCircle.setAttribute("cy", cy);
        visibleCircle.setAttribute("r", 7); // Die optische Größe
        visibleCircle.setAttribute("fill", "#fff");
        visibleCircle.setAttribute("stroke", "#0088ff");
        visibleCircle.setAttribute("stroke-width", "2");
        visibleCircle.setAttribute("style", "pointer-events: none;"); // Ignoriert Klicks, damit er die Hitbox nicht blockiert
        svg.appendChild(visibleCircle);

        // --- 2. DIE UNSICHTBARE HITBOX (Viel größer) ---
        let hitbox = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitbox.setAttribute("cx", cx); 
        hitbox.setAttribute("cy", cy);
        hitbox.setAttribute("r", 25); // Hier ist die Hitbox-Größe (z.B. 25-30px)
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute("style", "cursor: grab; pointer-events: all;"); 
        
        // Drag Logic (Jetzt auf der Hitbox registriert)
        hitbox.onmousedown = function(e) {
            e.preventDefault();
            
            pt.x = e.clientX;
            pt.y = e.clientY;
            let startP = pt.matrixTransform(svg.getScreenCTM().inverse());
            let startX = startP.x;
            let startY = startP.y;

            let activeIndex = i; 
            let isPendingCenterDrag = (radarValues[i] === 0);

            document.onmousemove = function(eMove) {
                pt.x = eMove.clientX;
                pt.y = eMove.clientY;
                let svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                let mouseX = svgP.x;
                let mouseY = svgP.y;
                
                if (isPendingCenterDrag) {
                    let moveDx = mouseX - startX;
                    let moveDy = mouseY - startY;
                    let distFromStart = Math.sqrt(moveDx*moveDx + moveDy*moveDy);

                    if (distFromStart > 5) {
                        let dragAngle = Math.atan2(moveDy, moveDx);
                        let bestDiff = Infinity;
                        let bestIndex = activeIndex;

                        for (let j = 0; j < 7; j++) {
                            if (radarValues[j] === 0) {
                                let axisAngle = (Math.PI * 2 * j / 7) - (Math.PI / 2);
                                let diff = Math.abs(Math.atan2(Math.sin(dragAngle - axisAngle), Math.cos(dragAngle - axisAngle)));
                                if (diff < bestDiff) {
                                    bestDiff = diff;
                                    bestIndex = j;
                                }
                            }
                        }
                        activeIndex = bestIndex;
                        isPendingCenterDrag = false;
                    } else {
                        return;
                    }
                }
                
                let dx = mouseX - center;
                let dy = mouseY - center;
                let currentAxisAngle = (Math.PI * 2 * activeIndex / 7) - (Math.PI / 2);
                let axisX = Math.cos(currentAxisAngle);
                let axisY = Math.sin(currentAxisAngle);
                
                let projectedDist = (dx * axisX) + (dy * axisY);
                let newVal = Math.max(0, Math.min(100, (projectedDist / maxRadius) * 100));
                
                radarValues[activeIndex] = Math.round(newVal);
                
                syncToUI();
                drawRadar(); 
            };
            
            document.onmouseup = function() {
                if (radarValues.reduce((a,b)=>a+b,0) === 0) {
                    radarValues = [100,100,100,100,100,100,100];
                    syncToUI();
                    drawRadar();
                }
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
        svg.appendChild(hitbox);
    });

    checkWarning();
}

// Synct das Radar mit den Checkboxen
function syncToUI() {
    const checkboxes = document.querySelectorAll('#decade-filters input');
    radarValues.forEach((val, i) => {
        checkboxes[i].checked = (val > 0);
    });
}

// Wird aufgerufen, wenn jemand eine Checkbox anklickt
function updateFromCheckbox() {
    const checkboxes = document.querySelectorAll('#decade-filters input');
    let allOff = true;
    
    checkboxes.forEach((cb, i) => {
        if (cb.checked) {
            radarValues[i] = 100;
            allOff = false;
        } else {
            radarValues[i] = 0;
        }
    });

    // Sonderfall: Alle Checkboxen aus -> Alle an
    if (allOff) {
        checkboxes.forEach(cb => cb.checked = true);
        radarValues = [100, 100, 100, 100, 100, 100, 100];
    }
    
    drawRadar();
}

// Prüft den Konflikt mit dem Jahres-Slider
function checkWarning() {
    const warningText = document.getElementById('radar-warning');
    if(!warningText) return;

    const minYear = parseInt(document.getElementById('year-min-val').innerText);
    const maxYear = parseInt(document.getElementById('year-max-val').innerText);
    
    let conflict = false;
    radarValues.forEach((val, i) => {
        if (val > 0) {
            // Checke grob, ob das Jahrzehnt überhaupt im Slider liegt
            let decStart = i === 0 ? 1900 : 1960 + (i * 10); 
            let decEnd = i === 0 ? 1969 : decStart + 9;
            
            if (decEnd < minYear || decStart > maxYear) {
                conflict = true;
            }
        }
    });

    if (conflict) {
        warningText.innerText = `⚠️ Achtung: Dein Jahres-Slider (${minYear}-${maxYear}) schließt hier gewählte Jahrzehnte aus! (Jahres-Slider hat Vorrang)`;
        warningText.classList.remove('hidden');
    } else {
        warningText.classList.add('hidden');
    }
}