import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

// Helper to load scripts sequentially. This is more reliable than ES module imports from CDNs for three.js.
const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
};

const loadThreeJs = async () => {
    // These must be loaded in order.
    await loadScript('https://cdn.jsdelivr.net/npm/three@0.138.3/build/three.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/three@0.138.3/examples/js/loaders/MTLLoader.js');
    await loadScript('https://cdn.jsdelivr.net/npm/three@0.138.3/examples/js/loaders/OBJLoader.js');
    await loadScript('https://cdn.jsdelivr.net/npm/three@0.138.3/examples/js/controls/OrbitControls.js');
};


// --- Main Card Element ---
class Floorplan3dCard extends LitElement {

    static get properties() {
        return {
            hass: {},
            config: {},
            _error: { type: String },
            _isLoading: { type: Boolean, state: true },
        };
    }

    static get styles() {
        return css`
            :host {
                display: block;
                height: 500px;
            }
            #container {
                width: 100%;
                height: 100%;
                position: relative;
                overflow: hidden;
            }
            canvas {
                display: block;
            }
            #loader {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 50px;
                height: 50px;
                border: 5px solid #f3f3f3; /* Light grey */
                border-top: 5px solid var(--primary-color, #3498db); /* Use HA primary color */
                border-radius: 50%;
                animation: spin 1s linear infinite;
                transform: translate(-50%, -50%);
                z-index: 10;
            }
            @keyframes spin {
                0% { transform: translate(-50%, -50%) rotate(0deg); }
                100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
            #error-message {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
                box-sizing: border-box;
                text-align: center;
            }
        `;
    }

    constructor() {
        super();
        this._error = null;
        this._isLoading = true;
        this.lightObjects = new Map();
        this.clickableObjects = [];
        this.modelGroup = null;
        this._boundOnMouseClick = this.onMouseClick.bind(this);
        this._boundOnWindowResize = this.onWindowResize.bind(this);
        this._boundRender = this.renderThree.bind(this);
    }
    
    setConfig(config) {
        if (!config || !config.obj_path || !config.mtl_path) {
            throw new Error("Configuration error: 'obj_path' and 'mtl_path' are required.");
        }
        this.config = config;
    }

    render() {
        if (this._error) {
            return html`<div id="error-message">${this._error}</div>`;
        }
        return html`
            ${this._isLoading ? html`<div id="loader"></div>` : ''}
            <div id="container" @click=${this._boundOnMouseClick}></div>
        `;
    }

    firstUpdated(changedProperties) {
        super.firstUpdated(changedProperties);
        this.container = this.shadowRoot.querySelector('#container');
        this.loadAndInit();
    }
    
    updated(changedProperties) {
        super.updated(changedProperties);
        if (this.config && this.hass) {
            this.updateLightStates();
        }
    }
    
    async loadAndInit() {
        this._isLoading = true;
        try {
            await loadThreeJs();
            this.initThreeJs();
        } catch (error) {
             console.error("Floorplan3D-Card: Failed to load Three.js libraries.", error);
             this._error = `Failed to load libraries: ${error.message}`;
             this._isLoading = false;
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this.resizeObserver = new ResizeObserver(this._boundOnWindowResize);
        this.resizeObserver.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        cancelAnimationFrame(this.animationFrameId);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.renderer) {
            this.renderer.dispose();
        }
    }

    initThreeJs() {
        try {
            this.setupScene();
            this.loadModel();
            this.renderThree();
            this.updateLightStates();
        } catch (error) {
            console.error("Floorplan3D-Card: Initialization failed.", error);
            this._error = `Initialization failed: ${error.message}`;
            this._isLoading = false;
        }
    }

    setupScene() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = null;

        const aspect = width / height;
        const frustumSize = 100;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            2000
        );
        this.scene.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };


        const ambientIntensity = this.config.ambient_light_intensity ?? 1.0;
        const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
        this.scene.add(ambientLight);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    loadModel() {
        const onProgress = (xhr) => {
            // This can be used to show a more detailed progress bar if desired.
            // For now, the spinner is sufficient.
        };
        const onError = (error) => {
            this._error = `Could not load model: ${error}`;
            this._isLoading = false;
        };
        
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.setPath(this.config.mtl_path.substring(0, this.config.mtl_path.lastIndexOf('/') + 1));
        mtlLoader.load(this.config.mtl_path.split('/').pop(), (materials) => {
            materials.preload();
            const objLoader = new THREE.OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath(this.config.obj_path.substring(0, this.config.obj_path.lastIndexOf('/') + 1));
            objLoader.load(this.config.obj_path.split('/').pop(), (object) => {
                
                object.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                this.modelGroup = new THREE.Group();
                this.modelGroup.add(object);
                this.scene.add(this.modelGroup);

                this.createLights(object, this.modelGroup);

                const box = new THREE.Box3().setFromObject(this.modelGroup);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                this.modelGroup.position.sub(center);

                const maxDim = Math.max(size.x, size.y, size.z);
                const aspect = this.container.clientWidth / this.container.clientHeight;
                const padding = 1.2;

                this.camera.left = maxDim * aspect / -2 * padding;
                this.camera.right = maxDim * aspect / 2 * padding;
                this.camera.top = maxDim / 2 * padding;
                this.camera.bottom = maxDim / -2 * padding;
                this.camera.near = 0.01;
                this.camera.far = maxDim * 20;
                this.camera.updateProjectionMatrix();

                this.camera.position.set(0, maxDim * 2, 0);

                this.controls.target.set(0, 0, 0);
                this.controls.update();
                
                this.updateLightStates();
                this._isLoading = false; // Hide spinner on success

            }, onProgress, onError);
        }, onProgress, onError);
    }
    
    createLights(model, container) {
        if (!this.config.light_map) return;
        
        const modelBox = new THREE.Box3().setFromObject(model);
        const modelSizeVec = modelBox.getSize(new THREE.Vector3());
        const defaultLightDistance = Math.max(modelSizeVec.x, modelSizeVec.y, modelSizeVec.z) * 5;

        this.config.light_map.forEach(lightConfig => {
            const { entity_id, position, object_name } = lightConfig;

            const hasPosition = position && position.x != null && position.y != null && position.z != null;

            if (!entity_id || (!hasPosition && !object_name)) {
                return;
            }
            
            const lightColor = lightConfig.color ? parseInt(lightConfig.color) : 0xffff00;
            const maxIntensity = lightConfig.intensity ?? 1;

            const pointLight = new THREE.PointLight(
                lightColor,
                0, // Start with intensity 0
                lightConfig.distance || defaultLightDistance, 
                lightConfig.decay || 2
            );
            
            pointLight.castShadow = true;

            this.lightObjects.set(entity_id, {
                light: pointLight,
                currentIntensity: 0,
                targetIntensity: 0,
                maxIntensity: maxIntensity,
            });
            
            if (hasPosition) {
                pointLight.position.set(
                    parseFloat(position.x), 
                    parseFloat(position.y), 
                    parseFloat(position.z)
                );
                
                const clickableRadius = Math.max(modelSizeVec.x, modelSizeVec.y, modelSizeVec.z) / 100;

                const isDebug = this.config.debug_mode === true;
                const helperMaterial = isDebug 
                    ? new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 })
                    : new THREE.MeshBasicMaterial({ visible: false });
                
                const geometry = new THREE.SphereGeometry(clickableRadius, 16, 16);
                const clickableTarget = new THREE.Mesh(geometry, helperMaterial);

                clickableTarget.position.copy(pointLight.position);
                clickableTarget.userData.entity_id = entity_id;
                
                container.add(clickableTarget);
                this.clickableObjects.push(clickableTarget);

            } else if (object_name) {
                model.traverse((child) => {
                    if (child.isMesh && child.name === object_name) {
                        const box = new THREE.Box3().setFromObject(child);
                        box.getCenter(pointLight.position);
                        child.userData.entity_id = entity_id;
                        this.clickableObjects.push(child);
                    }
                });
            }
            container.add(pointLight);
        });
    }

    updateLightStates() {
        if (!this.hass || !this.lightObjects.size) return;

        this.lightObjects.forEach((lightData, entity_id) => {
            const state = this.hass.states[entity_id];
            if (state) {
                if (state.state === 'on' && state.attributes.rgb_color) {
                    lightData.light.color.setRGB(...state.attributes.rgb_color.map(c => c / 255));
                } else {
                     const lightConfig = this.config.light_map.find(l => l.entity_id === entity_id);
                     if(lightConfig && lightConfig.color){
                        lightData.light.color.set(parseInt(lightConfig.color));
                     }
                }
                
                if (state.state === 'on') {
                    const brightness = state.attributes.brightness ? (state.attributes.brightness / 255) : 1;
                    lightData.targetIntensity = lightData.maxIntensity * brightness;
                } else {
                    lightData.targetIntensity = 0;
                }
            }
        });
    }

    onMouseClick(event) {
        if (!this.hass) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const lightIntersects = this.raycaster.intersectObjects(this.clickableObjects, true);
        if (lightIntersects.length > 0) {
            const entity_id = lightIntersects[0].object.userData.entity_id;
            if (entity_id) {
                this.hass.callService('light', 'toggle', { entity_id });
            }
            return;
        }

        if (this.config.debug_mode === true && this.modelGroup) {
            const modelIntersects = this.raycaster.intersectObjects(this.modelGroup.children, true);
            if (modelIntersects.length > 0) {
                const p = modelIntersects[0].point;
                const centerOffset = this.modelGroup.position.clone().negate();
                const originalCoords = p.add(centerOffset);

                console.log(`%c[FLOORPLAN DEBUG] Click coordinates:`, 'color: #03a9f4; font-weight: bold;', 
                    `position: { x: ${originalCoords.x.toFixed(3)}, y: ${originalCoords.y.toFixed(3)}, z: ${originalCoords.z.toFixed(3)} }`);
            }
        }
    }

    onWindowResize() {
        if (!this.renderer || !this.camera) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const aspect = width / height;

        const frustumHeight = this.camera.top - this.camera.bottom;
        const frustumWidth = frustumHeight * aspect;

        this.camera.left = frustumWidth / -2;
        this.camera.right = frustumWidth / 2;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    renderThree() {
        this.animationFrameId = requestAnimationFrame(this._boundRender);
        
        this.lightObjects.forEach(lightData => {
            const target = lightData.targetIntensity;
            const current = lightData.currentIntensity;

            if (Math.abs(target - current) < 0.01) {
                lightData.currentIntensity = target;
            } else {
                lightData.currentIntensity += (target - current) * 0.1;
            }
            
            lightData.light.intensity = lightData.currentIntensity;
            lightData.light.visible = lightData.light.intensity > 0.01;
        });

        if (this.controls) this.controls.update();
        if(this.renderer) this.renderer.render(this.scene, this.camera);
    }
    
    getCardSize() {
        return 8;
    }
}

customElements.define('floorplan-3d-card', Floorplan3dCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'floorplan-3d-card',
    name: '3D Floorplan Card',
    description: 'An interactive 3D floorplan of your home.',
    preview: true,
});
