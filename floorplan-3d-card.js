import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

// Helper to load Babylon.js scripts sequentially.
const loadScript = (src, global) => {
    return new Promise((resolve, reject) => {
        if (window[global]) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
};

const loadBabylonJs = async () => {
    // These must be loaded in order.
    await loadScript('https://cdn.babylonjs.com/babylon.js', 'BABYLON');
    await loadScript('https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js', 'BABYLON.OBJFileLoader');
    // Add the GUI library for on-screen text
    await loadScript('https://cdn.babylonjs.com/gui/babylon.gui.min.js', 'BABYLON.GUI');
};


// --- Main Card Element ---
class Floorplan3dCard extends LitElement {

    static get properties() {
        return {
            hass: {},
            config: {},
            _error: { type: String },
            _isLoading: { type: Boolean, state: true },
            _loadingProgress: { type: Number, state: true },
        };
    }

    static get styles() {
        return css`
            :host {
                position: relative;
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
                width: 100%;
                height: 100%;
                display: block;
                outline: none;
            }
            #loading-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: transparent;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10;
                border-radius: var(--ha-card-border-radius, 12px);
            }
            #loading-bar-container {
                width: 80%;
                max-width: 400px;
                height: 20px;
                background-color: #f3f3f3;
                border-radius: 10px;
                overflow: hidden;
            }
            #loading-bar {
                height: 100%;
                background-color: var(--primary-color, #3498db);
                width: 0%;
                border-radius: 10px;
                transition: width 0.1s linear;
            }
            #loading-text {
                margin-top: 10px;
                color: var(--primary-text-color, black);
                font-size: 1.2em;
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
        this._loadingProgress = 0;
        this.lightObjects = new Map();
        this.engine = null;
        this.scene = null;
        this.advancedTexture = null; // For the debug GUI
        this._boundOnWindowResize = this.onWindowResize.bind(this);
    }
    
    setConfig(config) {
        if (!config || !config.obj_path) { // MTL is often optional or embedded
            throw new Error("Configuration error: 'obj_path' is required.");
        }
        this.config = config;
    }

    render() {
        if (this._error) {
            return html`<div id="error-message">${this._error}</div>`;
        }
        return html`
            ${this._isLoading ? html`
                <div id="loading-overlay">
                    <div id="loading-bar-container">
                        <div id="loading-bar" style="width: ${this._loadingProgress}%"></div>
                    </div>
                    <div id="loading-text">Loading... ${Math.round(this._loadingProgress)}%</div>
                </div>
            ` : ''}
            <div id="container">
                 <canvas id="renderCanvas"></canvas>
            </div>
        `;
    }

    firstUpdated(changedProperties) {
        super.firstUpdated(changedProperties);
        this.container = this.shadowRoot.querySelector('#container');
        this.canvas = this.shadowRoot.querySelector('#renderCanvas');
        this.loadAndInit();
    }
    
    updated(changedProperties) {
        super.updated(changedProperties);
        if (this.config && this.hass && this.scene) {
            this.updateLightStates();
        }
    }
    
    async loadAndInit() {
        this._isLoading = true;
        try {
            await loadBabylonJs();
            await this.initBabylonJs(); // Now an async function
        } catch (error) {
             console.error("Floorplan3D-Card: Failed to load Babylon.js libraries.", error);
             this._error = `Failed to load libraries: ${error.message}`;
             this._isLoading = false;
        }
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('resize', this._boundOnWindowResize);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('resize', this._boundOnWindowResize);
        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
    }

    async initBabylonJs() {
        // Check for WebGPU support and create the appropriate engine.
        try {
            if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
                console.log("Floorplan3D-Card: WebGPU is supported. Creating WebGPUEngine.");
                this.engine = new BABYLON.WebGPUEngine(this.canvas);
                await this.engine.initAsync();
            } else {
                console.log("Floorplan3D-Card: WebGPU not supported. Falling back to WebGL.");
                this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
            }
        } catch (e) {
            console.error("Floorplan3D-Card: Could not create engine. Falling back to WebGL.", e);
            this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        }

        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // Transparent background

        // Initialize the GUI texture if in debug mode
        if (this.config.debug_mode) {
            this.advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        }

        this.setupCamera();
        
        const ambientIntensity = this.config.ambient_light_intensity ?? 1.0;
        new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene).intensity = ambientIntensity;

        this.loadModel();

        this.engine.runRenderLoop(() => {
            if (this.scene) {
                this.updateLightIntensityTransitions();
                this.scene.render();
            }
        });

        this.setupInteractions();
    }
    
    setupCamera() {
        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 3, new BABYLON.Vector3(0, 0, 0), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        // Initial ortho values, will be overridden after model load
        this.camera.orthoTop = 50;
        this.camera.orthoBottom = -50;
        this.camera.orthoLeft = -50;
        this.camera.orthoRight = 50;
        this.onWindowResize();
    }

    loadModel() {
        const onProgress = (evt) => {
            if (evt.lengthComputable) {
                this._loadingProgress = (evt.loaded / evt.total) * 100;
            }
        };

        const onError = (scene, message, exception) => {
            console.error("Floorplan3D-Card: Model loading error.", message, exception);
            this._error = `Could not load model: ${message}`;
            this._isLoading = false;
        };
        
        const modelUrl = this.config.obj_path;
        const rootUrl = modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
        const fileName = modelUrl.split('/').pop();

        BABYLON.SceneLoader.ImportMesh("", rootUrl, fileName, this.scene, (meshes) => {
            const modelGroup = new BABYLON.AbstractMesh("ModelRoot", this.scene);
            meshes.forEach(m => {
                m.parent = modelGroup;
            });
            
            const globalShadows = this.config.shadows !== false;

            meshes.forEach(mesh => {
                mesh.receiveShadows = globalShadows;
            });
            
            // Center and frame the model
            const bounds = modelGroup.getHierarchyBoundingVectors();
            const size = bounds.max.subtract(bounds.min);
            const center = bounds.min.add(size.scale(0.5));
            modelGroup.position = center.scale(-1);

            // Create lights AFTER the model has been moved.
            this.createLights();

            const maxDim = Math.max(size.x, size.z); // Use X and Z for a top-down view
            const padding = 1.2; 

            this.camera.orthoTop = (maxDim / 2) * padding;
            this.camera.orthoBottom = -this.camera.orthoTop;
            
            this.camera.radius = size.y * 2 > maxDim ? size.y * 2 : maxDim;

            this.onWindowResize(); 

            this.camera.target = BABYLON.Vector3.Zero();

            this.updateLightStates();
            this._isLoading = false;
            
        }, onProgress, onError);
    }
    
    createLights() {
        if (!this.config.light_map) return;
        
        const globalShadows = this.config.shadows !== false;
        const modelRoot = this.scene.getMeshByName("ModelRoot");
        const childMeshes = modelRoot ? modelRoot.getChildMeshes(true) : []; 

        this.config.light_map.forEach(lightConfig => {
            const { entity_id, xy, height, object_name } = lightConfig;

            if (!entity_id) return;
            
            const lightColor = lightConfig.color ? BABYLON.Color3.FromHexString(lightConfig.color) : new BABYLON.Color3(1, 1, 0);
            const maxIntensity = lightConfig.intensity ?? 1;

            const pointLight = new BABYLON.PointLight(entity_id, BABYLON.Vector3.Zero(), this.scene);
            pointLight.diffuse = lightColor;
            pointLight.specular = lightColor;
            pointLight.intensity = 0; // Start off
            
            let lightPosition = null;
            let clickableMesh = null;

            if (xy && Array.isArray(xy) && xy.length === 2 && height !== undefined) {
                // Position from config is treated as world coordinates
                lightPosition = new BABYLON.Vector3(parseFloat(xy[0]), parseFloat(height), parseFloat(xy[1]));
                // Create an invisible sphere to make this light clickable
                const clickableSphere = BABYLON.MeshBuilder.CreateSphere(`clickable_${entity_id}`, {diameter: 1.0}, this.scene);
                clickableSphere.position = lightPosition;
                clickableSphere.visibility = 0; // Make it invisible
                clickableMesh = clickableSphere;

            } else if (object_name) {
                 clickableMesh = this.scene.getMeshByName(object_name);
                 if (clickableMesh) {
                    lightPosition = clickableMesh.getAbsolutePosition(); 
                 }
            }

            if (!lightPosition) {
                console.warn(`Floorplan3D-Card: Could not find a position for light entity ${entity_id}`);
                return;
            }
            
            if (clickableMesh) {
                clickableMesh.userData = { entity_id }; 
            }
            
            pointLight.position = lightPosition;

            this.lightObjects.set(entity_id, {
                light: pointLight,
                currentIntensity: 0,
                targetIntensity: 0,
                maxIntensity: maxIntensity,
            });

            // Create a ShadowGenerator for each light that casts shadows
            if (globalShadows && lightConfig.cast_shadows === true) {
                const shadowGenerator = new BABYLON.ShadowGenerator(1024, pointLight);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurKernel = 32;
                childMeshes.forEach(m => shadowGenerator.getShadowMap().renderList.push(m));
            }

            // Create a debug marker for the light's position
            if (this.config.debug_mode === true) {
                const debugSphere = BABYLON.MeshBuilder.CreateSphere(`debug_${entity_id}`, {diameter: 0.5}, this.scene);
                debugSphere.position = lightPosition;
                const debugMaterial = new BABYLON.StandardMaterial(`debug_mat_${entity_id}`, this.scene);
                debugMaterial.emissiveColor = BABYLON.Color3.Red(); // Make it glow and ignore scene lighting
                debugSphere.material = debugMaterial;
            }
        });
    }

    updateLightStates() {
        if (!this.hass || !this.lightObjects.size) return;

        this.lightObjects.forEach((lightData, entity_id) => {
            const state = this.hass.states[entity_id];
            if (state) {
                // First, set the color based on the working Three.js logic
                if (state.state === 'on' && state.attributes.rgb_color) {
                    lightData.light.diffuse = BABYLON.Color3.FromInts(...state.attributes.rgb_color);
                } else {
                    const lightConfig = this.config.light_map.find(l => l.entity_id === entity_id);
                    if (lightConfig && lightConfig.color) {
                        lightData.light.diffuse = BABYLON.Color3.FromHexString(lightConfig.color);
                    }
                }
                
                // Then, set the intensity
                if (state.state === 'on') {
                    const brightness = state.attributes.brightness !== undefined ? (state.attributes.brightness / 255) : 1;
                    lightData.targetIntensity = lightData.maxIntensity * brightness;
                } else {
                    lightData.targetIntensity = 0;
                }
            }
        });
    }
    
    updateLightIntensityTransitions() {
        this.lightObjects.forEach(lightData => {
            const target = lightData.targetIntensity;
            const current = lightData.light.intensity;

            if (Math.abs(target - current) < 0.01) {
                lightData.light.intensity = target;
            } else {
                lightData.light.intensity += (target - current) * 0.1;
            }
        });
    }

    setupInteractions() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
                const pickResult = pointerInfo.pickInfo;
                if (pickResult.hit && pickResult.pickedMesh) {
                    // Check if a light's clickable mesh was clicked
                    if (pickResult.pickedMesh.userData && pickResult.pickedMesh.userData.entity_id) {
                        const entity_id = pickResult.pickedMesh.userData.entity_id;
                        this.hass.callService('light', 'toggle', { entity_id });
                    } 
                    // If debug mode is on and we didn't click a light, show coordinates
                    else if (this.config.debug_mode === true && this.advancedTexture) {
                        const p = pickResult.pickedPoint;

                        // Create a temporary marker
                        const marker = BABYLON.MeshBuilder.CreateSphere("debug_click_marker", {diameter: 0.3}, this.scene);
                        marker.position = p;
                        const markerMaterial = new BABYLON.StandardMaterial("debug_click_mat", this.scene);
                        markerMaterial.emissiveColor = BABYLON.Color3.Green();
                        marker.material = markerMaterial;

                        // Create a temporary text label using the existing GUI texture
                        const textBlock = new BABYLON.GUI.TextBlock();
                        textBlock.text = `xy: [${p.x.toFixed(2)}, ${p.z.toFixed(2)}], height: ${p.y.toFixed(2)}`;
                        textBlock.color = "white";
                        textBlock.fontSize = 14;
                        textBlock.background = "black";
                        textBlock.paddingLeft = "4px";
                        textBlock.paddingRight = "4px";
                        textBlock.paddingTop = "2px";
                        textBlock.paddingBottom = "2px";
                        this.advancedTexture.addControl(textBlock);
                        textBlock.linkWithMesh(marker);
                        textBlock.linkOffsetY = -20; // Position text above the marker

                        // Make them disappear after 5 seconds
                        setTimeout(() => {
                            marker.dispose();
                            this.advancedTexture.removeControl(textBlock);
                            textBlock.dispose();
                        }, 5000);
                    }
                }
            }
        });
    }

    onWindowResize() {
        if (!this.engine || !this.camera) return;
        this.engine.resize();
        
        if (this.container) {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                 const aspect = rect.width / rect.height;
                 const orthoTop = this.camera.orthoTop;
                 this.camera.orthoLeft = -orthoTop * aspect;
                 this.camera.orthoRight = orthoTop * aspect;
            }
        }
    }

    getCardSize() {
        return 8;
    }
}

customElements.define('floorplan-3d-card', Floorplan3dCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'floorplan-3d-card',
    name: '3D Floorplan Card (Babylon.js)',
    description: 'An interactive 3D floorplan of your home, powered by Babylon.js.',
    preview: true,
});
