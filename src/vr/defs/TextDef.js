import ObjectDef from './ObjectDef'
import {fetchGraphObject} from '../../syncgraph/utils'
import {OBJ_TYPES, PROP_DEFS} from '../Common'
import * as THREE from 'three'
import WebLayer3D from 'three-web-layer'

export default class TextDef extends ObjectDef {
    make(graph, scene) {
        if(!scene.id) throw new Error("can't create sphere w/ missing parent")
        return fetchGraphObject(graph,graph.createObject({
            type:OBJ_TYPES.text,
            title:'some text',
            visible:true,
            text:'cool <b>formatted</b> <i>text</i>',
            cssStyle:
`color:black; 
background-color:white;
width: 10em;
font-size: 200%;
`,

            tx:0, ty:0, tz:0,
            rx:0, ry:0, rz:0,
            sx:1, sy:1, sz:1,

            children:graph.createArray(),
            parent:scene.id
        }))
    }

    makeNode(obj) {
        const div = document.createElement('div')
        div.innerHTML = obj.text
        div.id = `div_${obj.id}`
        div.classList.add('weblayer-div')
        if(obj.cssStyle) div.setAttribute('style',obj.cssStyle)
        const divLayer = new WebLayer3D(div,{
            pixelRatio: window.devicePixelRatio,
            onLayerCreate(layer) {
                layer.mesh.material.side = THREE.DoubleSide
                layer.mesh.userData.graphid = obj.id
                layer.mesh.userData.clickable = true
            }
        })

        divLayer.refresh(true)
        divLayer.userData.clickable = true
        const node = new THREE.Object3D()

        node.previewUpdate = function() {
            divLayer.update()
        }        
        node.setText = function (text) {
            if (text !== node.userData.text) {
                node.userData.text = text
                node.userData.div.innerHTML = text
                //if(obj.cssStyle) node.userData.div.setAttribute('style',obj.cssStyle)

                // shouldn't be explicitly calling refresh
                //node.userData.divLayer.refresh(true)
            }
        }

        node.add(divLayer)
        node.userData.divLayer = divLayer
        node.userData.text = obj.text
        node.userData.div = div
        node.name = obj.title
        node.userData.clickable = true
        node.position.set(obj.tx, obj.ty, obj.tz)
        node.rotation.set(obj.rx,obj.ry,obj.rz)
        node.scale.set(obj.sx,obj.sy,obj.sz)
        node.visible = obj.visible
        this.regenerateText(node,obj)
        return node
    }

    updateProperty(node, obj, op, provider) {
        if(    op.name === PROP_DEFS.text.key) this.regenerateText(node,obj)
        if(    op.name === PROP_DEFS.cssStyle.key) this.regenerateText(node,obj)
        return super.updateProperty(node,obj,op,provider)
    }


    regenerateText(node, obj) {
        node.userData.div.innerHTML = obj.text
        if(obj.cssStyle) node.userData.div.setAttribute('style',obj.cssStyle)
        node.userData.divLayer.refresh(true)
    }
}



