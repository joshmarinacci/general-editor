import React, {Component} from 'react'
import ScriptManager, {SceneGraphProvider} from './ScriptManager'
import TreeItemProvider, {getDocsURL} from '../TreeItemProvider'
import {on, parseOptions} from '../utils'
import {TweenManager} from '../common/tween'
import * as THREE from 'three'
import {Group} from "three"
import {VRManager, VR_DETECTED, Pointer} from 'webxr-boilerplate'
import SceneDef from './defs/SceneDef'
import {get3DObjectDef, is3DObjectType, parseBehaviorScript, TOTAL_OBJ_TYPES} from './Common'
import {AuthModule} from './AuthModule'
import {XRSupport} from './XRSupport'
import {PubnubLogger} from '../syncgraph/PubnubSyncWrapper'


function attachUtilFunctions(obj) {
    obj.find = (match,list) => {
        if(!list) list = []
        if(match(obj)) list.push(obj)
        if(obj.children) obj.children.forEach(ch => {
            ch.find(match,list)
        })
        return list
    }
    obj.exists = ()=>true
}

export class ImmersivePlayer extends Component {
    constructor(props) {
        super(props)
        new TreeItemProvider(props.options)
        this.obj_map = {}
        this.three_map = {}
        this.title_map = {}
        this.current_scene = null
        this.root = null
        this.behavior_map = {}
        this.behavior_assets = {}
        this.pendingAssets = []
        this.scriptManager = new ScriptManager(new Adapter(this))
        const opts = parseOptions({})
        this.logger = new PubnubLogger(opts.doc)
        if(!opts.doc) throw new Error("doc not specified")
        this.provider = {
            accessObject:(id)=>{
                if(!this.obj_map[id]) return {
                    exists:()=>false,
                }
                return this.obj_map[id]
            }
        }
    }

    componentDidMount() {
        this.logger.log("mounted ImmersivePlayer")
        const canvas = this.canvas
        if(XRSupport.supportsARKit()) {
            this.xr = new XRSupport()
            this.xr.getContext(canvas).then((context) => {
                this.initThreeJS(canvas,context)
                this.xr.setAnimationLoop( this.renderThreeWithCamera)
                this.startScene()
            }).catch(err => {
                console.error('Error', err)
            })
        } else {
            this.initThreeJS(canvas,0)
            this.renderer.setAnimationLoop(this.renderThree)
            this.startScene()
        }

    }

    startScene() {
        const opts = parseOptions({})
        AuthModule.getJSON(getDocsURL()+opts.doc).then((payload)=>{
            this.root = payload.graph
            this.buildRoot(this.root)
            this.logger.log(this.root)
            if(this.root.defaultScene) {
                const sc = this.root.children.find(ch => ch.id  === this.root.defaultScene)
                this.setCurrentScene(sc)
            } else {
                const sc = this.root.children[0]
                this.setCurrentScene(sc)
            }
            Promise.all(this.pendingAssets).then(() => {
                this.logger.log("all assets loaded now. starting script manager")
                this.scriptManager.startRunning()
            })
        })
    }

    render() {
        return <div>
            {/*<div id="overlay">*/}
            {/*    <div id="inner">*/}
            {/*        <h1>Application Name</h1>*/}
            {/*        <div id="loading-indicator">*/}
            {/*            <label>loading</label>*/}
            {/*            <progress max="100" value="0" id="progress"></progress>*/}
            {/*        </div>*/}
            {/*        <button id="enter-button" disabled>VR not supported, play anyway</button>*/}
            {/*    </div>*/}
            {/*</div>*/}
            <canvas ref={c => this.canvas = c} width={600} height={400}/>
        </div>
    }

    buildRoot(graph) {
        //init assets first
        graph.children.forEach(ch => {
            if(ch.type === TOTAL_OBJ_TYPES.ASSETS_LIST) return this.initAssets(ch)
        })
        graph.children.forEach(ch => {
            attachUtilFunctions(ch)
            if(ch.type === TOTAL_OBJ_TYPES.SCENE) return this.initScene(ch)
            if(ch.type === TOTAL_OBJ_TYPES.BEHAVIORS_LIST) return this.initBehaviors(ch)
        })
    }

    initScene(def) {
        // console.log("making a scene",def)
        this.obj_map[def.id] = def
        const scene = new SceneDef().makeNode(def, this.provider)
        this.three_map[def.id] = scene
        this.scenes.add(scene)
        this.title_map[def.title] = def
        def.children.forEach(ch => {
            attachUtilFunctions(ch)
            this.obj_map[ch.id] = ch
            this.title_map[ch.title] = ch
            ch.props = () => {
                return ch
            }
            if(is3DObjectType(ch.type)) {
                const child = get3DObjectDef(ch.type).makeNode(ch, this.provider)
                this.three_map[ch.id] = child
                on(child, 'click', () => {
                    this.scriptManager.performClickAction(ch)
                })
                scene.add(child)
                //TODO: Make this recursive
                if(ch.children) {
                    ch.children.forEach(cch => {
                        attachUtilFunctions(cch)
                        if(cch.type === TOTAL_OBJ_TYPES.BEHAVIOR) {
                            this.behavior_map[cch.id] = cch
                            cch.props = () => {
                                return cch
                            }
                        }
                    })
                }
            }
            if(ch.type === TOTAL_OBJ_TYPES.BEHAVIOR) {
                this.behavior_map[ch.id] = ch
            }
        })
        scene.visible = false
    }

    initThreeJS(canvas, context) {
        this.tweenManager = new TweenManager()
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 50 );
        this.renderer = new THREE.WebGLRenderer( { antialias: true, canvas:canvas, context:context } );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.gammaOutput = true
        this.renderer.vr.enabled = true;
        // this.sceneContainer.appendChild( this.renderer.domElement );
        this.vrmanager = new VRManager(this.renderer)
        this.audioListener = new THREE.AudioListener()
        this.camera.add(this.audioListener)
        if(!this.xr) this.scene.background = new THREE.Color(0x000000);
        window.addEventListener( 'resize', ()=>{
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize( window.innerWidth, window.innerHeight );
        }, false );
        const light = new THREE.DirectionalLight( 0xffffff, 1.0 );
        light.position.set( 1, 1, 1 ).normalize();
        this.scene.add( light );
        this.scene.add(new THREE.AmbientLight(0xffffff,0.2))


        this.scenes = new Group()
        this.scene.add(this.scenes)

        // const $ = (sel) => document.querySelector(sel)
        // const on = (elem, type, cb) => elem.addEventListener(type,cb)

        // on($("#enter-button"),'click',()=>{
        //     $("#overlay").style.display = 'none'
        //     //we can start playing sound now
        // })
        /*
        this.vrmanager.addEventListener(VR_DETECTED,()=>{
            console.log("VR detected")
            $("#enter-button").removeAttribute('disabled',false)
            $("#enter-button").innerText = "enter vr"
            on($("#enter-button"),'click',()=> this.vrmanager.enterVR())
        })
         */

        // const WAIT_FOR_LOAD = false
        /*
        if(!WAIT_FOR_LOAD) {
            $("#loading-indicator").style.display = 'none'
            $("#enter-button").style.display = 'block'
            $("#enter-button").removeAttribute('disabled')
        }
         */


        //class which handles mouse and VR controller
        this.pointer = new Pointer(this, {
            intersectionFilter: ((o) => o.userData.clickable),
            cameraFollowMouse:false,
            mouseSimulatesController:false,
            enableLaser: true,
            laserLength: 20,
        })

    }

    renderThreeWithCamera = (bounds,projectionMatrix,viewMatrix, time,frame) => {
        if(!this.scene || !this.camera) return
        this.camera.matrix.fromArray(viewMatrix)
        this.camera.matrixWorldNeedsUpdate = true
        this.camera.updateMatrixWorld()
        this.camera.projectionMatrix.fromArray(projectionMatrix)
        this.renderThree(time,frame)
    }

    renderThree = (time, frame) => {
        if(this.tweenManager) this.tweenManager.update(time)
        if(this.pointer) this.pointer.tick(time)
        if(this.stats) this.stats.update(time)
        if(this.controller) this.controller.update(time)
        let session = null
        if(this.xr) session = this.xr.session
        this.scriptManager.tick(time, session, frame)
        this.renderer.render( this.scene, this.camera );
    }

    initAssets(assets) {
        assets.children.forEach(ch => {
            this.logger.log("loading asset",ch)
            attachUtilFunctions(ch)
            this.obj_map[ch.id] =  ch
        })
    }

    initBehaviors(behaviors) {
        behaviors.children.forEach(ch => {
            attachUtilFunctions(ch)
            this.obj_map[ch.id] =  ch
            if(ch.type === TOTAL_OBJ_TYPES.BEHAVIOR_SCRIPT) {
                this.logger.log("loading behavior",ch)
                const prom = AuthModule.fetch(ch.src,{
                    method:'GET'
                }) .then(res => res.text())
                    .then(text => {
                        const info = parseBehaviorScript(text)
                        info.text = text
                        this.behavior_assets[ch.id] = info
                        return text
                    })
                this.pendingAssets.push(prom)
            }
        })
    }

    setCurrentScene(scene) {
        this.scenes.children.forEach(sc => sc.visible = false)
        if(this.three_map[scene.id]) this.three_map[scene.id].visible = true
        this.current_scene = scene
    }

}

// ================  SGP implementation =====================

class Adapter extends SceneGraphProvider {
    constructor(player) {
        super()
        this.player = player
    }

    getCurrentScene() {
        return this.player.current_scene
    }
    getBehaviorsForObject (obj) {
        if(!obj.children) return []
        return obj.children.filter(ch => ch.type === TOTAL_OBJ_TYPES.BEHAVIOR)
    }
    getSceneObjects(sc) {
        return sc.children.filter(ch => is3DObjectType(ch.type))
    }
    getThreeObject (id)  {
        return this.player.three_map[id]
    }
    getParsedBehaviorAsset (b) {
        return this.player.behavior_assets[b.behavior]
    }
    getAllBehaviors () {
        return Object.keys(this.player.behavior_map).map(key => this.player.behavior_map[key])
    }
    navigateScene (sceneid) {
        console.log("navigating to ",sceneid)
        const scene = this.obj_map[sceneid]
        if(!scene) return console.warn("couldn't find scene for",sceneid)
        this.setCurrentScene(scene)
    }
    playAudioAsset (audio)  {
        console.log("trying to play",audio)
        const sound = new THREE.Audio(this.player.audioListener)
        const audioLoader = new THREE.AudioLoader()
        audioLoader.load(audio.src, function( buffer ) {
            sound.setBuffer( buffer );
            sound.setLoop( false );
            sound.setVolume( 0.5 );
            sound.play();
        });
    }
    getGraphObjectByName(title) {
        return this.player.title_map[title]
    }
    getGraphObjectById (id) {
        return this.player.obj_map[id]
    }
    startImageRecognizer(info) {
        console.log("PRETENDING to START THE IMAGE RECOGNIZER")
    }
}
