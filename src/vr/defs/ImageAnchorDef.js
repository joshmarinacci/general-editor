import {fetchGraphObject} from "../../syncgraph/utils"
import {Group, Mesh, MeshLambertMaterial, SphereBufferGeometry} from 'three'
import ObjectDef from './ObjectDef'
import {OBJ_TYPES, REC_TYPES} from '../Common'

let COUNTER = 0

export default class ImageAnchorDef extends ObjectDef {
    make(graph, scene) {
        if(!scene.id) throw new Error("can't imageanchor w/ missing parent")
        return fetchGraphObject(graph,graph.createObject({
            type:OBJ_TYPES.imageanchor,
            title:'image anchor '+COUNTER++,
            visible:true,
            tx:0, ty:0, tz:-5,
            rx:0, ry:0, rz:0,
            sx:1, sy:1, sz:1,
            color:'#00ff00',
            children:graph.createArray(),
            targetImage:null,
            imageRealworldWidth:1,
            recType:REC_TYPES.SCENE_START,
            parent:scene.id
        }))
    }
    makeNode(obj) {
        const node = new Group()
        node.name = obj.title
        node.userData.clickable = true
        node.position.set(obj.tx, obj.ty, obj.tz)
        node.rotation.set(obj.rx,obj.ry,obj.rz)
        node.scale.set(obj.sx,obj.sy,obj.sz)

        const clicker =  new Mesh(
            new SphereBufferGeometry(1),
            new MeshLambertMaterial({color:"red", transparent:true, opacity: 0.2})
        )
        clicker.material.visible = true
        clicker.userData.clickable = true
        node.userData.clicker = clicker
        node.add(clicker)
        node.init = (evt) => {
            clicker.visible = false
            node.visible = false
            node.userData.info = {
                image: evt.system.getObjectById(obj.targetImage),
                imageRealworldWidth: obj.imageRealworldWidth,
                recType: obj.recType,
                object: obj,
                node: node,
                callback: (info) => {
                    evt.system.fireEvent(obj, 'recognized', info)
                    node.visible = true
                }
            }
            evt.system.startImageRecognizer(node.userData.info)
        }
        node.stop = (evt) => {
            clicker.visible = true
            evt.system.stopImageRecognizer(node.userData.info)
        }
        return node
    }

    updateProperty(node, obj, op, provider) {
        return super.updateProperty(node,obj,op,provider)
    }

}