import TreeItemProvider, {SERVER_URL, TREE_ITEM_PROVIDER} from '../TreeItemProvider'
import {GET_JSON, POST_JSON, setQuery} from '../utils'
import {UndoQueue} from '../metadoc/UndoQueue'
import {EventCoalescer} from '../metadoc/EventCoalescer'
import SelectionManager from '../SelectionManager'
import {PubnubSyncWrapper} from '../metadoc/PubnubSyncWrapper'

const {DocGraph, CommandGenerator} = require("syncing_protocol");

export default class MetadocEditor extends  TreeItemProvider {
    constructor() {
        super()
        this.datalisteners = []
        this.rawlisteners = []

        const doc = new DocGraph()
        this.makeEmptyRoot(doc)
        this.setupDocFlow(doc,this.genID('doc'))
    }
    getDocHistory = () => this.getDataGraph().getHistory()
    onRawChange = cb => this.rawlisteners.push(cb)
    getRawGraph = () => this.coalescer
    getDataGraph = () => this.syncdoc
    getSceneRoot = () => this.getDataGraph().getObjectByProperty('type','root')

    getRootList = () => this.getDataGraph().getPropertyValue(this.getSceneRoot(),'children')

    hasChildren = (item) => item && this.getDataGraph().hasPropertyValue(item,'children')
    getChildren = (item) => {
        const doc = this.getDataGraph()
        const CH = doc.getPropertyValue(item,'children')
        const len = doc.getArrayLength(CH)
        const ch = []
        for(let i=0; i<len; i++) {
            ch.push(doc.getElementAt(CH,i))
        }
        return ch
    }
    isExpanded = (item) => true



    setPropertyValue(item, def, value) {
        this.getDataGraph().setProperty(item,def.key,value)
        this.fire(TREE_ITEM_PROVIDER.PROPERTY_CHANGED,{
            provider: this,
            child:item,
            propKey:def.key,
            oldValue:def.value,
            newValue:value
        })
    }




    // =================== doc stuff ==========================
    save = () => {
        const payload_obj = {
            history:this.getDocHistory(),
            type:this.getDocType(),
            id:this.getDocId()
        }
        const payload_string = JSON.stringify(payload_obj)
        return POST_JSON(SERVER_URL+this.getDocId(),payload_string).then((res)=>{
            setQuery({mode:'edit',doc:this.getDocId(), doctype:this.getDocType()})
            this.fire(TREE_ITEM_PROVIDER.SAVED,true)
        }).catch((e)=> console.log("error",e))
    }

    loadDoc(docid) {
        return GET_JSON(SERVER_URL+docid).then((payload)=>{
            const doc = this.makeDocFromServerHistory(payload.history)
            this.setupDocFlow(doc,docid)
        }).catch((e)=>{
            console.log("missing doc. create a new doc",e)
            const doc = new DocGraph()
            this.makeEmptyRoot(doc)
            this.setupDocFlow(doc,this.genID('doc'))
        })
    }

    setupDocFlow(doc,docid) {
        //shut down old network connection
        if(this.pubnub) this.pubnub.shutdown()
        this.pubnub = null

        this.syncdoc = doc
        this.cmd = new CommandGenerator(this.syncdoc)
        this.root = this.getSceneRoot()
        this.docid = docid
        this.undoqueue = new UndoQueue(doc)
        this.coalescer = new EventCoalescer(this.syncdoc) //sends calls on to sync doc, and fires change event
        this.coalescer.onChange((op) => this.undoqueue.submit(op))

        this.coalescer.onRawChange(op =>this.rawlisteners.forEach(cb => cb(op)))
        this.syncdoc.onChange(op => this.rawlisteners.forEach(cb => cb(op)))
        this.syncdoc.onChange((op)=>{
            this.fire(TREE_ITEM_PROVIDER.STRUCTURE_CHANGED, { provider:this });
            this.fire(TREE_ITEM_PROVIDER.PROPERTY_CHANGED, { provider:this });
        })
        this.fire(TREE_ITEM_PROVIDER.STRUCTURE_CHANGED, { provider:this });
        this.fire(TREE_ITEM_PROVIDER.CLEAR_DIRTY,true)
        SelectionManager.clearSelection()
        this.pubnub = new PubnubSyncWrapper(this,this.syncdoc)
        this.pubnub.unpause()
        this.pubnub.start()
        this.connected = true
        this.fire("CONNECTED",this.connected)
        setQuery({mode:'edit',doc:this.getDocId(), doctype:this.getDocType()})
    }

    reloadDocument() {
        return GET_JSON(SERVER_URL+this.docid).then((payload)=>{
            if(payload.type !== this.getDocType()) throw new Error("incorrect doctype for this provider",payload.type)
            const doc = this.makeDocFromServerHistory(payload.history)
            this.setupDocFlow(doc,this.docid)
        }).catch((e)=>{
            console.log("couldn't reload the doc",e)
        })

    }

    toggleConnected = () => {
        this.connected = !this.connected
        if(this.pubnub) {
            if(this.connected) {
                this.pubnub.unpause()
            } else {
                this.pubnub.pause()
            }
        }
        this.fire("CONNECTED",this.connected)
    }

    isConnected = () => this.connected

    pauseQueue = () => this.coalescer.pause()
    unpauseQueue = () => this.coalescer.unpause()

    performUndo = () => {
        if(this.undoqueue.canUndo()) this.undoqueue.undo()
    }
    performRedo = () => {
        if(this.undoqueue.canRedo()) this.undoqueue.redo()
    }

    makeDocFromServerHistory(history) {
        const doc = new DocGraph()
        history.forEach(op => doc.process(op))
        return doc
    }


}