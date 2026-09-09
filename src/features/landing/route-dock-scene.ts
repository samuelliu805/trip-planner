export type PointerPosition = { x: number; y: number };

type ThreeModule = typeof import("three");

export function createRouteDockScene(THREE: ThreeModule) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  const routeField = new THREE.Group();
  scene.add(routeField);

  const routeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.6, 1.9, -0.8),
    new THREE.Vector3(-3.2, -1.1, 0.2),
    new THREE.Vector3(-0.9, 1.2, -0.1),
    new THREE.Vector3(1.5, -0.5, 0.35),
    new THREE.Vector3(4.8, 1.1, -0.55),
  ]);
  const routePoints = routeCurve.getPoints(180);
  const routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints);
  routeGeometry.setDrawRange(0, 0);
  const routeMaterial = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0x78d5c8,
    depthWrite: false,
    opacity: 0.9,
    transparent: true,
  });
  const routeGlowMaterial = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0x4e9ca6,
    depthWrite: false,
    opacity: 0.24,
    transparent: true,
  });
  routeField.add(
    new THREE.Line(routeGeometry, routeGlowMaterial),
    new THREE.Line(routeGeometry, routeMaterial),
  );

  const branchMaterial = new THREE.LineBasicMaterial({
    color: 0x5a9297,
    opacity: 0.14,
    transparent: true,
  });
  const branchGeometries = [
    [
      new THREE.Vector3(-5.8, -2.4, -1.5),
      new THREE.Vector3(-2.6, -0.4, -1.2),
      new THREE.Vector3(0.8, -2.1, -1.4),
      new THREE.Vector3(5.7, -0.9, -1.5),
    ],
    [
      new THREE.Vector3(-5.8, 2.8, -1.8),
      new THREE.Vector3(-2.1, 1.4, -1.4),
      new THREE.Vector3(1.3, 2.5, -1.6),
      new THREE.Vector3(5.6, 1.9, -1.8),
    ],
  ].map((points) =>
    new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(90)),
  );
  for (const geometry of branchGeometries) routeField.add(new THREE.Line(geometry, branchMaterial));

  const railMaterial = new THREE.LineBasicMaterial({
    color: 0x42737d,
    opacity: 0.16,
    transparent: true,
  });
  const railGeometries: import("three").BufferGeometry[] = [];
  for (const y of [-2.1, 2.1]) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-6, y, -1.6),
      new THREE.Vector3(6, y, -1.6),
    ]);
    railGeometries.push(geometry);
    routeField.add(new THREE.Line(geometry, railMaterial));
  }

  const nodeStops = [0, 0.24, 0.5, 0.75, 1];
  const nodeGeometry = new THREE.RingGeometry(0.055, 0.095, 24);
  const nodeMaterials = nodeStops.map(
    () =>
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: 0xa6efd1,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
        transparent: true,
      }),
  );
  const routeNodes = nodeStops.map((stop, index) => {
    const node = new THREE.Mesh(nodeGeometry, nodeMaterials[index]);
    node.position.copy(routeCurve.getPointAt(stop));
    node.visible = false;
    routeField.add(node);
    return node;
  });

  const travelerGeometry = new THREE.CircleGeometry(0.065, 24);
  const travelerMaterial = new THREE.MeshBasicMaterial({ color: 0xdf8068 });
  const haloGeometry = new THREE.RingGeometry(0.11, 0.19, 32);
  const haloMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0xffc0a9,
    depthWrite: false,
    opacity: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const traveler = new THREE.Group();
  traveler.add(
    new THREE.Mesh(haloGeometry, haloMaterial),
    new THREE.Mesh(travelerGeometry, travelerMaterial),
  );
  traveler.visible = false;
  routeField.add(traveler);

  const trailGeometry = new THREE.CircleGeometry(0.035, 16);
  const trailMaterials = Array.from(
    { length: 9 },
    (_, index) =>
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: index % 2 ? 0x78d5c8 : 0xdf8068,
        depthWrite: false,
        opacity: 0,
        transparent: true,
      }),
  );
  const travelerTrail = new THREE.Group();
  travelerTrail.name = "route-traveler-trail";
  const trailDots = trailMaterials.map((material) => {
    const dot = new THREE.Mesh(trailGeometry, material);
    dot.visible = false;
    travelerTrail.add(dot);
    return dot;
  });
  routeField.add(travelerTrail);

  const signalStops = [0.24, 0.5, 0.75];
  const signalGeometry = new THREE.RingGeometry(0.18, 0.195, 40);
  const signalMaterials = signalStops.map(
    () =>
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: 0xc7a45a,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
        transparent: true,
      }),
  );
  const waypointSignals = new THREE.Group();
  waypointSignals.name = "route-waypoint-signals";
  const signalRings = signalStops.map((stop, index) => {
    const ring = new THREE.Mesh(signalGeometry, signalMaterials[index]);
    ring.position.copy(routeCurve.getPointAt(stop));
    ring.visible = false;
    waypointSignals.add(ring);
    return ring;
  });
  routeField.add(waypointSignals);

  const arrivalGeometry = new THREE.RingGeometry(0.12, 0.14, 40);
  const arrivalMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0x78b79a,
    depthWrite: false,
    opacity: 0,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const arrivalRing = new THREE.Mesh(arrivalGeometry, arrivalMaterial);
  arrivalRing.position.copy(routeCurve.getPointAt(1));
  routeField.add(arrivalRing);

  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(72 * 3);
  for (let index = 0; index < 72; index += 1) {
    particlePositions[index * 3] = ((index * 47) % 137) / 10 - 6.8;
    particlePositions[index * 3 + 1] = ((index * 29) % 79) / 10 - 3.9;
    particlePositions[index * 3 + 2] = -1.5 - ((index * 17) % 37) / 12;
  }
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    color: 0x90c7b2,
    depthWrite: false,
    opacity: 0.32,
    size: 0.04,
    transparent: true,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  const completionLight = new THREE.PointLight(0x70d4b4, 0, 12);
  completionLight.position.set(3.2, 0.3, 2);
  scene.add(completionLight);
  const pointer = { x: 0, y: 0 };
  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  function render(nextProgress: number, time: number, targetPointer: PointerPosition) {
    const routeProgress = clamp((nextProgress - 0.12) / 0.46);
    const elapsed = time / 1_000;
    routeGeometry.setDrawRange(0, Math.round(routePoints.length * routeProgress));
    pointer.x += (targetPointer.x - pointer.x) * 0.045;
    pointer.y += (targetPointer.y - pointer.y) * 0.045;
    routeField.rotation.x = pointer.y * -0.025;
    routeField.rotation.y = pointer.x * 0.035;
    branchMaterial.opacity = 0.11 + Math.sin(elapsed * 0.65) * 0.025;
    particles.rotation.z = nextProgress * 0.04 + elapsed * 0.006;
    particles.position.y = Math.sin(elapsed * 0.34) * 0.055;
    routeNodes.forEach((node, index) => {
      const revealed = routeProgress >= nodeStops[index] - 0.025;
      const pulse = 1 + Math.sin(elapsed * 2.4 + index * 0.9) * 0.16;
      node.visible = revealed;
      node.scale.setScalar(pulse);
      nodeMaterials[index].opacity = revealed ? 0.52 + (pulse - 1) * 0.9 : 0;
    });
    traveler.visible = routeProgress > 0.015 && routeProgress < 0.995;
    traveler.position.copy(routeCurve.getPointAt(routeProgress));
    traveler.rotation.z = elapsed * 0.8;
    haloMaterial.opacity = 0.42 + Math.sin(elapsed * 3.2) * 0.18;
    trailDots.forEach((dot, index) => {
      const trailProgress = routeProgress - (index + 1) * 0.015;
      dot.visible = traveler.visible && trailProgress > 0;
      if (!dot.visible) return;
      dot.position.copy(routeCurve.getPointAt(trailProgress));
      dot.scale.setScalar(1 - index * 0.065);
      trailMaterials[index].opacity = (1 - index / trailDots.length) * 0.36;
    });
    signalRings.forEach((ring, index) => {
      const revealed = routeProgress >= signalStops[index] - 0.02;
      const signalPhase = (elapsed * 0.28 + index * 0.24) % 1;
      ring.visible = revealed;
      ring.scale.setScalar(1 + signalPhase * 3.2);
      signalMaterials[index].opacity = revealed ? (1 - signalPhase) * 0.38 : 0;
    });
    const arrival = clamp((nextProgress - 0.72) / 0.12);
    arrivalRing.scale.setScalar(1 + arrival * 4.5);
    arrivalMaterial.opacity = Math.sin(arrival * Math.PI) * 0.7;
    camera.position.x = (nextProgress < 0.8 ? nextProgress * 0.35 : 0.28) + pointer.x * 0.2;
    camera.position.y = pointer.y * -0.13;
    camera.position.z = 8 - Math.min(nextProgress, 0.8) * 0.45;
    camera.lookAt(0, 0, 0);
    completionLight.intensity = Math.max(0, 1 - Math.abs(nextProgress - 0.79) * 14) * 1.6;
  }

  function dispose() {
    routeGeometry.dispose();
    routeMaterial.dispose();
    routeGlowMaterial.dispose();
    branchGeometries.forEach((geometry) => geometry.dispose());
    branchMaterial.dispose();
    railGeometries.forEach((geometry) => geometry.dispose());
    railMaterial.dispose();
    nodeGeometry.dispose();
    nodeMaterials.forEach((material) => material.dispose());
    travelerGeometry.dispose();
    travelerMaterial.dispose();
    haloGeometry.dispose();
    haloMaterial.dispose();
    trailGeometry.dispose();
    trailMaterials.forEach((material) => material.dispose());
    signalGeometry.dispose();
    signalMaterials.forEach((material) => material.dispose());
    arrivalGeometry.dispose();
    arrivalMaterial.dispose();
    particleGeometry.dispose();
    particleMaterial.dispose();
  }

  return { camera, dispose, render, scene };
}
