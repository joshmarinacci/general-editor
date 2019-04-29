import React, {Component} from 'react'
import {Dialog, DialogManager, HBox, VBox} from 'appy-comps'
import {listToArray} from '../../syncgraph/utils'
import {addGLBAssetFromFile} from '../AssetActions'

export class AddGLBAssetDialog extends Component {
    cancel = () => {
        DialogManager.hide()
    }
    okay = () => {
        DialogManager.hide()
        listToArray(this.fileinput.files).forEach(file => {
            addGLBAssetFromFile(file, this.props.provider)
        })
    }

    render() {
        return <Dialog visible={true}>
            <VBox>
                <h3>add GLB to assets</h3>
                <p>
                    choose a GLB file
                </p>
                <input type="file" ref={(obj) => this.fileinput = obj} onChange={this.selectedFile} multiple={true}/>
                <HBox>
                    <button onClick={this.cancel}>cancel</button>
                    <button onClick={this.okay}>okay</button>
                </HBox>
            </VBox>
        </Dialog>
    }

    selectedFile = (e) => {
        console.log("selected a file", e.target)
    }
}