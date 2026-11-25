import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SA11_KEYS, SA11_TONES, SA11Key } from '../data/sa11Data';
import { Crosshair, Eye, RotateCcw, Volume2 } from 'lucide-react';

interface CasioSA11_3DProps {
  activeMidiNotes: number[];       // Notes currently pressed (real keyboard audio OR virtual click) -> RED!
  targetMidiNote?: number | null;  // Target note for education mode -> BLUE highlight
  selectedToneCode: string;        // "00".."99"
  detectedNoteLabel: string | null;
  detectedFreqHz: number | null;
  detectedCents: number | null;
  isLineInConnected: boolean;
  octaveShift: number;
  tuningCents: number;
  isCalibrating: boolean;
  calibrationProgress: number;
  onOctaveShiftChange: (shift: number) => void;
  onStartCalibration: () => void;
  onVirtualKeyPress: (key: SA11Key) => void;
  onVirtualKeyRelease: (key: SA11Key) => void;
  onToneDigitClick?: (digit: number) => void;
}

type CameraPreset = 'front' | 'top' | 'iso' | 'back';

function createTopPanelTexture(selectedToneCode: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 420;
  const ctx = canvas.getContext('2d')!;

  // Matte dark charcoal panel background
  ctx.fillStyle = '#1f2228';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle horizontal accent line
  ctx.fillStyle = '#3d5afe';
  ctx.fillRect(360, 26, 1200, 4);

  // CASIO SA-11 Branding (left of tone table)
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 44px Inter, Arial, sans-serif';
  ctx.fillText('CASIO', 360, 92);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 28px Inter, Arial, sans-serif';
  ctx.fillText('SA-11', 515, 90);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 18px JetBrains Mono, monospace';
  ctx.fillText('100 SOUND', 360, 128);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 26px Inter, Arial, sans-serif';
  ctx.fillText('TONE BANK', 360, 158);

  // Active tone readout badge on panel
  const tone = SA11_TONES.find((t) => t.code === selectedToneCode) ?? SA11_TONES[0];
  ctx.fillStyle = '#111318';
  ctx.fillRect(360, 185, 220, 62);
  ctx.strokeStyle = '#3d5afe';
  ctx.lineWidth = 2;
  ctx.strokeRect(360, 185, 220, 62);
  ctx.fillStyle = '#60a5fa';
  ctx.font = '700 13px JetBrains Mono, monospace';
  ctx.fillText('ACTIVE TONE', 372, 206);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px JetBrains Mono, monospace';
  ctx.fillText(`${tone.code} ${tone.name.slice(0, 13)}`, 372, 234);

  // Printed 100-Tone Bank Chart (10 columns x 10 rows — just like the real SA-11!)
  const startX = 615;
  const colW = 96;
  const startY = 58;
  const rowH = 22;

  ctx.font = '600 10.5px JetBrains Mono, monospace';
  for (let col = 0; col < 10; col++) {
    const x = startX + col * colW;
    for (let row = 0; row < 10; row++) {
      const idx = col * 10 + row;
      const t = SA11_TONES[idx];
      if (!t) continue;
      const y = startY + row * rowH;
      const isSel = t.code === selectedToneCode;
      if (isSel) {
        ctx.fillStyle = '#eb5757';
        ctx.fillRect(x - 3, y - 12, colW - 4, 16);
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#cbd5e1';
      }
      ctx.fillText(`${t.code} ${t.name.slice(0, 9)}`, x, y);
    }
  }

  // Labels above button row
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 13px Inter, sans-serif';
  ctx.fillText('VOLUME', 625, 315);
  ctx.fillText('DEMO', 715, 315);
  ctx.fillText('TEMPO', 795, 315);
  ctx.fillText('SELECT', 880, 315);
  ctx.fillText('STOP', 950, 315);
  ctx.fillText('TONE SELECT (0 - 9)', 1170, 315);

  // Subtle rhythm strip label above keys
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px JetBrains Mono, monospace';
  ctx.fillText('◄ SUPER ACCOMPANIMENT (SİYAH TUŞLAR)  •  19 AUTO-RHYTHM (BEYAZ TUŞLAR) ►', 430, 396);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const CasioSA11_3D: React.FC<CasioSA11_3DProps> = ({
  activeMidiNotes,
  targetMidiNote = null,
  selectedToneCode,
  detectedNoteLabel,
  detectedFreqHz,
  detectedCents,
  isLineInConnected,
  octaveShift,
  tuningCents,
  isCalibrating,
  calibrationProgress,
  onOctaveShiftChange,
  onStartCalibration,
  onVirtualKeyPress,
  onVirtualKeyRelease,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keyMeshesRef = useRef<Map<number, {
    pivot: THREE.Group;
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    isBlack: boolean;
  }>>(new Map());
  const panelMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const activeNotesRef = useRef<Set<number>>(new Set());
  const targetNoteRef = useRef<number | null>(null);
  const pressedMouseMidiRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onVirtualKeyPress, onVirtualKeyRelease });
  const [camPreset, setCamPreset] = useState<CameraPreset>('iso');

  callbacksRef.current = { onVirtualKeyPress, onVirtualKeyRelease };

  // Keep refs synced for animation loop
  useEffect(() => {
    activeNotesRef.current = new Set(activeMidiNotes);
  }, [activeMidiNotes]);

  useEffect(() => {
    targetNoteRef.current = targetMidiNote ?? null;
  }, [targetMidiNote]);

  // Update top panel printed texture when selectedToneCode changes
  useEffect(() => {
    if (panelMatRef.current) {
      const oldTex = panelMatRef.current.map;
      panelMatRef.current.map = createTopPanelTexture(selectedToneCode);
      panelMatRef.current.needsUpdate = true;
      oldTex?.dispose();
    }
  }, [selectedToneCode]);

  // Move camera to preset
  const applyCameraPreset = (preset: CameraPreset) => {
    setCamPreset(preset);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    if (preset === 'iso') {
      cam.position.set(0.0, 2.75, 3.05);
      ctrl.target.set(0, 0.05, 0.15);
    } else if (preset === 'front') {
      cam.position.set(0.0, 1.55, 3.6);
      ctrl.target.set(0, 0.05, 0.2);
    } else if (preset === 'top') {
      cam.position.set(0.0, 4.15, 0.45);
      ctrl.target.set(0, 0, 0.05);
    } else if (preset === 'back') {
      cam.position.set(-0.6, 1.35, -3.1);
      ctrl.target.set(0, 0.1, -0.4);
    }
    ctrl.update();
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 900;
    const height = el.clientHeight || 330;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f7fb');

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0.0, 2.75, 3.05);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.8;
    controls.maxDistance = 7.5;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.05, 0.15);
    controls.update();
    controlsRef.current = controls;

    // Bright studio lighting (matches airy FilterDesign aesthetic)
    const ambient = new THREE.AmbientLight('#ffffff', 0.95);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.25);
    keyLight.position.set(3.5, 6.0, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#dce7ff', 0.6);
    fillLight.position.set(-4.0, 3.0, -2.5);
    scene.add(fillLight);

    // Subtle studio floor shadow receiver
    const floorGeo = new THREE.PlaneGeometry(18, 12);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.11 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.255;
    floor.receiveShadow = true;
    scene.add(floor);

    // =====================================================================
    // Casio SA-11 Chassis (Authentic 470 x 165 x 50 mm -> 4.70 x 1.65 x 0.50)
    // =====================================================================
    const keyboardGroup = new THREE.Group();
    scene.add(keyboardGroup);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#23262d',
      roughness: 0.58,
      metalness: 0.12,
    });

    // Main lower chassis
    const mainChassis = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.36, 1.65), bodyMat);
    mainChassis.position.set(0, -0.07, 0);
    mainChassis.castShadow = true;
    mainChassis.receiveShadow = true;
    keyboardGroup.add(mainChassis);

    // Upper control deck (rear half)
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(4.66, 0.15, 0.84), bodyMat);
    upperDeck.position.set(0, 0.16, -0.39);
    upperDeck.castShadow = true;
    upperDeck.receiveShadow = true;
    keyboardGroup.add(upperDeck);

    // Left speaker housing (extends full depth on left side of SA-11)
    const leftBlock = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.15, 0.80), bodyMat);
    leftBlock.position.set(-1.86, 0.16, 0.41);
    leftBlock.castShadow = true;
    leftBlock.receiveShadow = true;
    keyboardGroup.add(leftBlock);

    // Right end cheek
    const rightCheek = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.80), bodyMat);
    rightCheek.position.set(2.24, 0.16, 0.41);
    rightCheek.castShadow = true;
    keyboardGroup.add(rightCheek);

    // Top printed panel plate
    const panelTex = createTopPanelTexture(selectedToneCode);
    const panelMat = new THREE.MeshStandardMaterial({
      map: panelTex,
      roughness: 0.48,
      metalness: 0.05,
    });
    panelMatRef.current = panelMat;
    const panelPlate = new THREE.Mesh(new THREE.PlaneGeometry(4.56, 0.80), panelMat);
    panelPlate.rotation.x = -Math.PI / 2;
    panelPlate.position.set(0, 0.238, -0.39);
    keyboardGroup.add(panelPlate);

    // Authentic Horizontal Slotted Speaker Grille on LEFT side (Casio SA-11)
    const slotMat = new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.9 });
    for (let s = 0; s < 14; s++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.015, 0.025), slotMat);
      slot.position.set(-1.86, 0.242, 0.08 + s * 0.052);
      keyboardGroup.add(slot);
    }

    // Power Slide Switch (top-left)
    const powerTrack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.07), slotMat);
    powerTrack.position.set(-1.18, 0.244, -0.16);
    keyboardGroup.add(powerTrack);
    const powerKnob = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.045, 0.065),
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4 })
    );
    powerKnob.position.set(-1.14, 0.258, -0.16);
    keyboardGroup.add(powerKnob);

    // Authentic Vertical Rectangular Buttons (VOLUME, DEMO, TEMPO, SELECT, STOP, TONE 0-9)
    const btnGrayMat = new THREE.MeshStandardMaterial({ color: '#3b404c', roughness: 0.42 });
    const btnBlueMat = new THREE.MeshStandardMaterial({ color: '#3d5afe', roughness: 0.38 });
    const btnRedMat = new THREE.MeshStandardMaterial({ color: '#eb5757', roughness: 0.38 });

    const buttonSpecs: Array<{ x: number; mat: THREE.Material }> = [
      { x: -0.56, mat: btnGrayMat }, // VOL -
      { x: -0.45, mat: btnGrayMat }, // VOL +
      { x: -0.26, mat: btnRedMat },  // DEMO
      { x: -0.04, mat: btnGrayMat }, // TEMPO -
      { x: 0.07, mat: btnGrayMat },  // TEMPO +
      { x: 0.22, mat: btnBlueMat },  // SELECT
      { x: 0.35, mat: btnGrayMat },  // STOP
    ];
    // 10 Tone select buttons (0..9)
    for (let d = 0; d < 10; d++) {
      buttonSpecs.push({ x: 0.62 + d * 0.145, mat: btnGrayMat });
    }
    for (const b of buttonSpecs) {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.042, 0.16), b.mat);
      btn.position.set(b.x, 0.252, -0.12);
      btn.castShadow = true;
      keyboardGroup.add(btn);
    }

    // Back Panel: OUTPUT Jack (3.5mm TRS) + DC 7.5V Jack
    const metalMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.85, roughness: 0.2 });
    const outputJackRing = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20), metalMat);
    outputJackRing.rotation.x = Math.PI / 2;
    outputJackRing.position.set(-0.35, 0.0, -0.84);
    keyboardGroup.add(outputJackRing);

    const outputJackHole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.055, 16), slotMat);
    outputJackHole.rotation.x = Math.PI / 2;
    outputJackHole.position.set(-0.35, 0.0, -0.845);
    keyboardGroup.add(outputJackHole);

    // Blue Line-In Cable Plug indicator sticking out of OUTPUT jack
    const plugSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: '#3d5afe', roughness: 0.35, metalness: 0.2 })
    );
    plugSleeve.rotation.x = Math.PI / 2;
    plugSleeve.position.set(-0.35, 0.0, -0.97);
    keyboardGroup.add(plugSleeve);

    const dcJack = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), slotMat);
    dcJack.rotation.x = Math.PI / 2;
    dcJack.position.set(-0.12, 0.0, -0.84);
    keyboardGroup.add(dcJack);

    // =====================================================================
    // 32 Mini Keys (19 White + 13 Black, F3 to C6)
    // =====================================================================
    const whiteCount = 19;
    const keybedWidth = 3.44;
    const keybedStartX = -1.32;
    const whiteStep = keybedWidth / whiteCount;
    const whiteW = whiteStep * 0.90;
    const whiteH = 0.13;
    const whiteD = 0.76;

    const blackW = whiteStep * 0.56;
    const blackH = 0.11;
    const blackD = 0.47;

    const keyMap = new Map<number, {
      pivot: THREE.Group;
      mesh: THREE.Mesh;
      material: THREE.MeshStandardMaterial;
      isBlack: boolean;
    }>();

    const clickableMeshes: THREE.Mesh[] = [];

    for (const k of SA11_KEYS) {
      const pivot = new THREE.Group();
      if (!k.isBlack) {
        const x = keybedStartX + (k.whiteIndex + 0.5) * whiteStep;
        pivot.position.set(x, 0.145, 0.03);
        const mat = new THREE.MeshStandardMaterial({
          color: '#fdfdfd',
          roughness: 0.28,
          metalness: 0.04,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(whiteW, whiteH, whiteD), mat);
        mesh.position.set(0, 0, whiteD / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { midi: k.midi };
        pivot.add(mesh);
        keyboardGroup.add(pivot);
        keyMap.set(k.midi, { pivot, mesh, material: mat, isBlack: false });
        clickableMeshes.push(mesh);
      } else {
        // Black key sits between whiteIndex and whiteIndex + 1
        const x = keybedStartX + (k.whiteIndex + 1) * whiteStep;
        pivot.position.set(x, 0.215, 0.03);
        const mat = new THREE.MeshStandardMaterial({
          color: '#18191d',
          roughness: 0.34,
          metalness: 0.1,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(blackW, blackH, blackD), mat);
        mesh.position.set(0, 0, blackD / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { midi: k.midi };
        pivot.add(mesh);
        keyboardGroup.add(pivot);
        keyMap.set(k.midi, { pivot, mesh, material: mat, isBlack: true });
        clickableMeshes.push(mesh);
      }
    }

    keyMeshesRef.current = keyMap;

    // Raycasting for clicking 3D keys
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const getHitMidi = (ev: PointerEvent): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0 && typeof hits[0].object.userData.midi === 'number') {
        return hits[0].object.userData.midi as number;
      }
      return null;
    };

    const onPointerDown = (ev: PointerEvent) => {
      const midi = getHitMidi(ev);
      if (midi !== null) {
        controls.enabled = false;
        pressedMouseMidiRef.current = midi;
        const found = SA11_KEYS.find((x) => x.midi === midi);
        if (found) callbacksRef.current.onVirtualKeyPress(found);
      }
    };

    const onPointerUp = () => {
      if (pressedMouseMidiRef.current !== null) {
        const found = SA11_KEYS.find((x) => x.midi === pressedMouseMidiRef.current);
        pressedMouseMidiRef.current = null;
        if (found) callbacksRef.current.onVirtualKeyRelease(found);
      }
      controls.enabled = true;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(el);

    // Colors for key states
    const colorWhiteIdle = new THREE.Color('#fdfdfd');
    const colorBlackIdle = new THREE.Color('#18191d');
    const colorRedActive = new THREE.Color('#eb5757');
    const colorRedEmissive = new THREE.Color('#dc2626');
    const colorTargetBlue = new THREE.Color('#3d5afe');
    const colorTargetEmissive = new THREE.Color('#2563eb');
    const colorZero = new THREE.Color('#000000');

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const activeSet = activeNotesRef.current;
      const target = targetNoteRef.current;

      keyMap.forEach((entry, midi) => {
        const isPressed = activeSet.has(midi);
        const isTarget = !isPressed && target === midi;

        // Smooth physical key depression
        const targetRotX = isPressed ? 0.085 : 0.0;
        entry.pivot.rotation.x += (targetRotX - entry.pivot.rotation.x) * 0.35;

        if (isPressed) {
          // IMMEDIATE RED ILLUMINATION!
          entry.material.color.copy(colorRedActive);
          entry.material.emissive.copy(colorRedEmissive);
          entry.material.emissiveIntensity = 0.72;
        } else if (isTarget) {
          entry.material.color.copy(colorTargetBlue);
          entry.material.emissive.copy(colorTargetEmissive);
          entry.material.emissiveIntensity = 0.42;
        } else {
          entry.material.color.copy(entry.isBlack ? colorBlackIdle : colorWhiteIdle);
          entry.material.emissive.copy(colorZero);
          entry.material.emissiveIntensity = 0;
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="stage-card">
      <div className="stage-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-h)' }}>
            Casio SA-11 — İnteraktif 3D Model
          </span>
          <select
            className="select mono"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11.5 }}
            title="Klavyenizin oktav aralığına göre seçin"
            value={octaveShift}
            onChange={(e) => onOctaveShiftChange(Number(e.target.value))}
          >
            <option value={-1}>Oktav: -1 (F2–C5)</option>
            <option value={0}>Oktav: Normal (F3–C6)</option>
            <option value={1}>Oktav: +1 (F4–C7)</option>
          </select>
          <button
            className={`btn btn-sm ${isCalibrating ? 'btn-danger' : ''}`}
            disabled={!isLineInConnected}
            title={
              isLineInConnected
                ? 'Klavyenizdeki en sol beyaz tuşa (Fa) 1 saniye basılı tutarak oktav ve akordu kararlı şekilde eşleştirin'
                : 'Önce Line-In bağlantısını başlatın'
            }
            onClick={onStartCalibration}
          >
            <Crosshair size={13} />
            {isCalibrating
              ? `En Sol Tuşa (Fa) Basılı Tutun (${calibrationProgress}/10)`
              : 'Otomatik Kalibre Et'}
          </button>
          {tuningCents !== 0 && (
            <span className="chip accent mono">Akort: {tuningCents > 0 ? `+${tuningCents}` : tuningCents}c</span>
          )}
          <span className={`chip ${isLineInConnected ? 'ok' : ''}`}>
            {isLineInConnected ? 'Line-In Aktif' : 'Sanal / Tıklanabilir Mod'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`btn btn-sm ${camPreset === 'iso' ? 'btn-primary' : ''}`}
            onClick={() => applyCameraPreset('iso')}
          >
            <Eye size={13} /> Perspektif
          </button>
          <button
            className={`btn btn-sm ${camPreset === 'front' ? 'btn-primary' : ''}`}
            onClick={() => applyCameraPreset('front')}
          >
            Ön
          </button>
          <button
            className={`btn btn-sm ${camPreset === 'top' ? 'btn-primary' : ''}`}
            onClick={() => applyCameraPreset('top')}
          >
            Üstten
          </button>
          <button
            className={`btn btn-sm ${camPreset === 'back' ? 'btn-primary' : ''}`}
            onClick={() => applyCameraPreset('back')}
          >
            Arka (Output)
          </button>
          <button
            className="btn btn-sm"
            onClick={() => applyCameraPreset('iso')}
            title="Kamerayı Sıfırla"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div className="stage-canvas-wrap" ref={containerRef}>
        <div className="stage-overlay-note">
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Algılanan Nota
            </div>
            <div className="detected-note-big">
              {detectedNoteLabel ?? '—'}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
            <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-h)' }}>
              {detectedFreqHz ? `${detectedFreqHz.toFixed(1)} Hz` : 'Bekleniyor...'}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              {detectedCents !== null
                ? `Sapma: ${detectedCents >= 0 ? '+' : ''}${detectedCents} cent`
                : 'Tuşa basın veya 3D tuşa tıklayın'}
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 14,
            background: 'rgba(255,255,255,0.88)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 9px',
            fontSize: 11.5,
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          <Volume2 size={13} />
          <span>Basılı Tuş: <strong style={{ color: 'var(--danger)' }}>Kırmızı</strong></span>
          {targetMidiNote && (
            <span>• Hedef Tuş: <strong style={{ color: 'var(--accent)' }}>Mavi</strong></span>
          )}
          <span>• Döndürmek için sürükleyin</span>
        </div>
      </div>
    </div>
  );
};
