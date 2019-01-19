import React, {Component} from 'react'
import * as THREE from 'three'

import './VREditor.css'

// for pointer (mouse, controller, touch) support
import {
    POINTER_CLICK,
    POINTER_ENTER,
    POINTER_EXIT,
    POINTER_MOVE,
    Pointer,
    POINTER_PRESS,
    POINTER_RELEASE
} from 'webxr-boilerplate/pointer'
import VRStats from "webxr-boilerplate/vrstats"
// enter and exit VR
import VRManager, {VR_DETECTED} from "webxr-boilerplate/vrmanager"
import {TREE_ITEM_PROVIDER} from '../TreeItemProvider'
import TransformControls from './TransformControls'
import SelectionManager, {SELECTION_MANAGER} from '../SelectionManager'
import {DoubleSide} from 'three'

const {DocGraph, CommandGenerator, SET_PROPERTY, INSERT_ELEMENT} = require("syncing_protocol");

function fetchGraphObject(graph, child) {
    const obj = {}
    graph.getPropertiesForObject(child).forEach(key => {
        obj[key] = graph.getPropertyValue(child,key)
    })
    return obj
}


const on = (elem,type,cb) => elem.addEventListener(type,cb)
const off = (elem,type,cb) => elem.removeEventListener(type,cb)

export default class ImmersiveVREditor extends Component {


    render() {
        return <div>
            <div id="overlay">
                <div id="inner">
                    <h1>Application Name</h1>
                    <div id="loading-indicator">
                        <label>loading</label>
                        <progress max="100" value="0" id="progress"></progress>
                    </div>
                    <button id="enter-button" disabled>VR not supported, play anyway</button>
                </div>
            </div>
            <div ref={c => this.wrapper = c}></div>
        </div>
    }


    componentDidMount() {
        this.initScene()
        this.renderer.setAnimationLoop(this.render3.bind(this))
    }

    render3(time) {
        //update the pointer and stats, if configured
        if(this.pointer) this.pointer.tick(time)
        if(this.stats) this.stats.update(time)
        this.renderer.render( this.scene, this.camera );
    }


    initScene() {

        const $ = (sel) => document.querySelector(sel)
        const on = (elem, type, cb) => elem.addEventListener(type,cb)

        const container = this.wrapper
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 50 );
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        const renderer = this.renderer
        renderer.setPixelRatio( window.devicePixelRatio );
        renderer.setSize( window.innerWidth, window.innerHeight );
        renderer.gammaOutput = true
        renderer.vr.enabled = true;
        container.appendChild( renderer.domElement );
        this.vrmanager = new VRManager(renderer)

        this.initContent()

        window.addEventListener( 'resize', ()=>{
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize( window.innerWidth, window.innerHeight );
        }, false );


        on($("#enter-button"),'click',()=>{
            $("#overlay").style.display = 'none'
            //we can start playing sound now
        })

        this.vrmanager.addEventListener(VR_DETECTED,()=>{
            console.log("VR detected")
            $("#enter-button").removeAttribute('disabled',false)
            $("#enter-button").innerText = "enter vr"
            on($("#enter-button"),'click',()=> this.vrmanager.enterVR())
        })

        const WAIT_FOR_LOAD = false

        if(!WAIT_FOR_LOAD) {
            $("#loading-indicator").style.display = 'none'
            $("#enter-button").style.display = 'block'
            $("#enter-button").removeAttribute('disabled')
        }

        this.props.provider.onRawChange(this.updateScene.bind(this))
        this.props.provider.on(TREE_ITEM_PROVIDER.DOCUMENT_SWAPPED, this.documentSwapped.bind(this))
        SelectionManager.on(SELECTION_MANAGER.CHANGED, this.selectionChanged.bind(this))
        //clear selection when click on the bg
        on(this.pointer,POINTER_CLICK,()=> SelectionManager.clearSelection())

        this.loadScene()
    }

    selectionChanged() {
        const sel = SelectionManager.getSelection()
        if (sel === null) {
            this.controls.detach(this.selectedNode)
            return
        }
        const graph = this.props.provider.getDataGraph()
        const obj = fetchGraphObject(graph, sel)
        console.log(obj)
        const node = this.findNode(sel)
        if(this.selectedNode !== node) {
            this.controls.detach(this.selectedNode)
        }
        this.selectedNode = node
        console.log(node)
        if (node) {
            this.controls.attach(node, this.pointer)
        }
    }


    initContent() {
        const $ = (sel) => document.querySelector(sel)
        const on = (elem, type, cb) => elem.addEventListener(type,cb)
        this.scene.background = new THREE.Color( 0xcccccc );
        //a standard light
        const light = new THREE.DirectionalLight( 0xffffff, 1.0 );
        light.position.set( 1, 1, 1 ).normalize();
        this.scene.add( light );

        this.scene.add(new THREE.AmbientLight(0xffffff,0.2))





        // enable stats visible inside VR
        this.stats = new VRStats(this.renderer)
        //this.stats.position.x = 0
        // this.stats.position.y = -1
        this.camera.add(this.stats)
        this.scene.add(this.camera)

        //class which handles mouse and VR controller
        this.pointer = new Pointer(this.scene,this.renderer,this.camera, {

            //Pointer searches everything in the scene by default
            //override this to match just certain things
            intersectionFilter: ((o) => o.userData.clickable),

            //make the camera pan when moving the mouse. good for simulating head turning on desktop
            cameraFollowMouse:false,

            // set to true to move the controller node forward and tilt with the mouse.
            // good for testing VR controls on desktop
            mouseSimulatesController:false,

            //turn this off if you provide your own pointer model
            enableLaser: true,
        })


        const STICK_HEIGHT = 1.0
        const stick = new THREE.Mesh(
            new THREE.CylinderBufferGeometry(0.1,0.1,STICK_HEIGHT),
            new THREE.MeshLambertMaterial({color:'aqua'})
        )
        const toRad = (degrees) => degrees*Math.PI/180
        stick.position.z = -STICK_HEIGHT/2;
        stick.rotation.x = toRad(-90)
        this.pointer.controller1.add(stick)


        this.controls = new TranslateControl()
        this.scene.add(this.controls)
        on(this.controls,'change',(e)=>{
            const sel = SelectionManager.getSelection()
            if(sel) {
                const node = this.findNode(sel)
                const prov = this.props.provider
                prov.quick_setPropertyValue(sel,'tx',node.position.x)
                prov.quick_setPropertyValue(sel,'ty',node.position.y)
                prov.quick_setPropertyValue(sel,'tz',node.position.z)
            }
        })
    }


    updateScene(op) {
        const graph = this.props.provider.getDataGraph()
        if (op.type === INSERT_ELEMENT) {
            console.log('running', op.type)
            const objid = op.value
            const obj = fetchGraphObject(graph, objid)
            if (obj.type === 'scene') {
                const scene = this.populateNode(objid)
                this.setCurrentSceneId(objid)
                return
            }
            if (obj.type === 'cube') {
                const cube = this.populateNode(objid)
                this.sceneWrapper.add(cube)
                return
            }
            console.warn("unknown object type", obj)
            return
        }
        if (op.type === SET_PROPERTY) {
            console.log('running', op.type)
            const node = this.findNode(op.object)
            if (node) {
                if (op.name === 'tx') node.position.x = parseFloat(op.value)
                if (op.name === 'ty') node.position.y = parseFloat(op.value)
                if (op.name === 'tz') node.position.z = parseFloat(op.value)
            } else {
                console.log("could not find the node for object id:", op)
            }
            return
        }
        console.log('skipping', op.type)
    }
    documentSwapped() {
        console.log("totally new document!")
        //nuke all the old stuff
        if (this.sceneWrapper) {
            this.scene.remove(this.sceneWrapper)
            this.sceneWrapper = null
        }
        this.obj_node_map = {}
        this.setState({scene: -1})
        //make new stuff
        const hist = this.props.provider.getDocHistory()
        console.log("==== replaying history")
        hist.forEach(op => this.updateScene(op))
    }

    setCurrentSceneId(sceneid) {
        if (this.sceneWrapper) {
            this.scene.remove(this.sceneWrapper)
            this.sceneWrapper = null
        }
        this.setState({scene: sceneid})
        this.sceneWrapper = this.findNode(sceneid)
        this.scene.add(this.sceneWrapper)
    }

    loadScene() {
        console.log("loading the final scene")
        const graph = this.props.provider.getDataGraph()
        console.log("history is",this.props.provider.getDocHistory())
    }

    insertNodeMapping(id, node) {
        if (typeof id !== 'string') throw new Error("cannot map an object to an object. invalid call in insertNodeMapping")
        this.obj_node_map[id] = node
        node.userData.graphid = id
    }

    findNode(id) {
        if (!this.obj_node_map[id]) console.warn("could not find node for id", id)
        return this.obj_node_map[id]
    }

    populateNode(nodeid) {
        const graph = this.props.provider.getDataGraph()
        const obj = fetchGraphObject(graph, nodeid)
        if (obj.type === 'cube') {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(obj.width, obj.height, obj.depth),
                new THREE.MeshLambertMaterial({color: 'red'})
            )
            cube.userData.clickable = true
            cube.addEventListener('click',(e)=>{
                console.log('clicked on it',cube.userData.graphid)
                SelectionManager.setSelection(cube.userData.graphid)
            })
            cube.position.set(obj.tx, obj.ty, obj.tz)
            this.insertNodeMapping(nodeid, cube)
            return cube
        }
        if (obj.type === 'scene') {
            const scene = new THREE.Group()
            this.insertNodeMapping(nodeid, scene)
            return scene
        }

        console.warn("cannot populate node for type", obj.type)
    }

}


class TranslateControl extends THREE.Group {
    constructor() {
        super()
        this.handles = []
        this.handles.push(new TranslationArrow('X',this))
        this.handles.push(new TranslationArrow('Y',this))
        this.handles.push(new TranslationArrow('Z',this))
        this.handles.forEach(h => this.add(h))
        this.visible = false
    }
    attach(target, pointer) {
        this.target = target
        this.pointer = pointer
        this.position.copy(target.position)
        this.visible = true
        this.handles.forEach(h => h.attach())
    }
    detach() {
        this.target = null
        this.pointer = null
        this.visible = false
        this.handles.forEach(h => h.attach())
    }
}

class TranslationArrow extends THREE.Group {
    constructor(axis, control) {
        super()
        this.axis = axis
        this.control = control
        this.makePlane()
        this.makeArrow()
        this.makeInputGrabber()
    }
    makePlane() {
        this.plane = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(100,100,100,100),
            new THREE.MeshBasicMaterial({visible:true, wireframe:true, side: THREE.DoubleSide})
        )
        if(this.axis === 'Z') {
            this.plane.rotation.y = 90*Math.PI/180
        }
        this.plane.userData.draggable = true
        this.plane.visible = false
        this.add(this.plane)
    }
    makeArrow() {
        this.arrow = new THREE.Mesh(
            new THREE.CylinderBufferGeometry(0.02,0.02,5),
            new THREE.MeshLambertMaterial({color:'yellow'})
        )
        if(this.axis === 'X') this.arrow.rotation.z = 90  * Math.PI / 180
        if(this.axis === 'Y') this.arrow.rotation.z = 180 * Math.PI / 180
        if(this.axis === 'Z') this.arrow.rotation.x = 90  * Math.PI / 180
        this.add(this.arrow)
    }
    makeInputGrabber() {
        this.input = new THREE.Mesh(
            new THREE.CylinderBufferGeometry(0.1,0.1,5),
            new THREE.MeshLambertMaterial({color:'green', visible: false})
        )
        if(this.axis === 'X') this.input.rotation.z = 90  * Math.PI / 180
        if(this.axis === 'Y') this.input.rotation.z = 180 * Math.PI / 180
        if(this.axis === 'Z') this.input.rotation.x = 90  * Math.PI / 180
        this.input.userData.clickable = true
        this.add(this.input)
    }
    attach() {
        on(this.input,POINTER_ENTER,this.startHover)
        on(this.input,POINTER_EXIT,this.endHover)
        on(this.input,POINTER_PRESS,this.beginDrag)
    }
    detach() {
        off(this.input,POINTER_ENTER,this.startHover)
        off(this.input,POINTER_EXIT,this.endHover)
        off(this.input,POINTER_PRESS,this.beginDrag)
    }

    startHover = () => this.arrow.material.color.set(0xffffff)
    endHover   = () => this.arrow.material.color.set(0xffff00)

    beginDrag = (e) => {
        this.startPoint = this.parent.position.clone()
        this.startPoint.copy(e.intersection.point)
        this.oldFilter = this.parent.pointer.intersectionFilter
        this.parent.pointer.intersectionFilter = (obj) => obj.userData.draggable
        this.startPosition = this.parent.target.position.clone()
        this.plane.visible = true
        on(this.plane,POINTER_MOVE,this.updateDrag)
        on(this.plane,POINTER_RELEASE,this.endDrag)
    }
    updateDrag = (e) => {
        this.endPoint = e.intersection.point.clone()
        //neutralize y and z
        if(this.axis === 'X') {
            this.endPoint.y = this.startPoint.y
            this.endPoint.z = this.startPoint.z
        }
        if(this.axis === 'Y') {
            this.endPoint.x = this.startPoint.x
            this.endPoint.z = this.startPoint.z
        }
        if(this.axis === 'Z') {
            this.endPoint.x = this.startPoint.x
            this.endPoint.y = this.startPoint.y
        }
        const diff = this.endPoint.clone().sub(this.startPoint)
        const finalPoint = this.startPosition.clone().add(diff)
        this.parent.target.position.copy(finalPoint)
        this.parent.position.copy(finalPoint)
    }
    endDrag = (e) => {
        off(this.plane,POINTER_MOVE,this.updateDrag)
        off(this.plane,POINTER_RELEASE,this.endDrag)
        this.parent.pointer.intersectionFilter = this.oldFilter
        this.plane.visible = false
        this.parent.dispatchEvent({type:'change',start:this.startPosition.clone(),end:this.parent.position.clone()})
    }
}
