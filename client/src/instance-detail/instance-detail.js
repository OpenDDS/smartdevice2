// @flow

import capitalize from 'lodash/capitalize';
import sortBy from 'lodash/sortBy';
import React, {Component} from 'react';
import {dispatchSet, watch} from 'redux-easy';

import InstanceAlerts from '../instance-alerts/instance-alerts';
import PropertyForm from '../property-form/property-form';
import Button from '../share/button';
import {showModal, showPrompt} from '../share/sd-modal';
import {createNode, deleteNode, getChildTypes} from '../tree/tree-util';
import {values} from '../util/flow-util';
import {getJson} from '../util/rest-util';
import {getTypeNode, loadTypeNode} from '../util/node-util';
import ReactChartkick, {LineChart, ColumnChart} from 'react-chartkick';
import Chart from 'chart.js';
import * as moment from 'moment';

import type {
  AlertType,
  EnumMapType,
  EnumType,
  InstanceDataType,
  NodeMapType,
  NodeType,
  PropertyType,
  UiType
} from '../types';

import './instance-detail.css';

type PropsType = {
  enumMap: EnumMapType,
  instanceData: Object,
  instanceNodeMap: NodeMapType,
  ui: UiType
};

/*
async function getAlerts(node: NodeType): Promise<AlertType[]> {
  if (!node) return Promise.resolve([]);

  const json = await getJson(`alerts/${node.id}`);
  return ((json: any): AlertType[]);
}
*/

async function getAllAlerts(): Promise<AlertType[]> {
  const json = await getJson('alerts');
  return ((json: any): AlertType[]);
}

function getData(node: NodeType): InstanceDataType[] {
  if (!node) return [];

  const json = getJson(`instances/${node.id}/data`);
  return ((json: any): InstanceDataType[]);
}

export async function reloadAlerts() {
  const alerts = await getAllAlerts();
  dispatchSet('alerts', alerts);
}

class InstanceDetail extends Component<PropsType> {
  addInstance = () => {
    const node = this.getNode(this.props);
    showPrompt({
      buttonText: 'Create',
      label: 'Name',
      okCb: () => createNode('instance', node),
      path: 'ui.instanceName',
      title: 'Add Instance'
    });
  };

  alertIsFor(instanceId: number, alertInstanceId: number) {
    if (alertInstanceId === instanceId) return true;
    const {instanceNodeMap} = this.props;
    const node = instanceNodeMap[instanceId];
    const {children} = node;
    return children.some(childId => this.alertIsFor(childId, alertInstanceId));
  }

  breadcrumbs = instanceNode => {
    const {instanceNodeMap} = this.props;
    const crumbs = [<span key="self">{instanceNode.name}</span>];

    const selectInstance = id => dispatchSet('ui.selectedInstanceNodeId', id);

    while (true) {
      const {parentId} = instanceNode;
      if (!parentId) break;
      const parentNode = instanceNodeMap[parentId];
      const {name} = parentNode;
      if (name === 'root') break;
      crumbs.unshift(<span key={parentId}> &gt; </span>);
      crumbs.unshift(
        <a
          className="breadcrumb"
          key={parentId + name}
          onClick={() => selectInstance(parentId)}
        >
          {name}
        </a>
      );
      instanceNode = parentNode;
    }

    return <div className="breadcrumbs">{crumbs}</div>;
  };

  componentDidMount() {
    const node = this.getNode(this.props);
    this.loadData(node);
  }

  componentWillReceiveProps(nextProps: PropsType) {
    const node = this.getNode(nextProps);
    if (!node) return;

    // If the same node has already been processed ...
    const prevNode = this.getNode(this.props);
    if (prevNode && node.id === prevNode.id) return;

    this.loadData(node);
  }

  deleteInstance = () => {
    const node = this.getNode(this.props);
    deleteNode('instance', node);
  };

  editProperties = () => {
    const node = this.getNode(this.props);
    const renderFn = () => <PropertyForm />;
    showModal({title: node.name + ' Properties', renderFn});
  };

  formatValue = (kind, value) => {
    if (value === undefined) return 'unset';
    if (kind === 'boolean') return Boolean(Number(value));
    if (kind === 'percent') return Number(value).toFixed(2) + '%';
    if (kind === 'number') return value;
    if (kind === 'text') return value;

    // Define if this is an enumerated type ...
    const {enumMap} = this.props;
    const enums = values(enumMap);
    const anEnum = enums.find(anEnum => anEnum.name === kind);
    if (anEnum) {
      const members = values(anEnum.memberMap);
      const v = Number(value);
      const member = members.find(member => member.value === v);
      return member ? member.name : 'bad enum value ' + value;
    }

    return value; // works for kind = 'number', 'text', ...
  };

  getNode = (props: PropsType) => {
    const {instanceNodeMap, ui} = props;
    return instanceNodeMap[ui.selectedInstanceNodeId];
  };

  instanceButtons = () => {
    const node = this.getNode(this.props);
    const canAddChild = getChildTypes(node).length > 0;
    return (
      <div className="buttons">
        {canAddChild && (
          <Button
            key="add"
            className="add"
            icon="plus"
            onClick={this.addInstance}
            tooltip="add child instance"
          />
        )}
        <Button
          key="delete"
          className="delete"
          icon="trash-o"
          onClick={this.deleteInstance}
          tooltip="delete instance"
        />
      </div>
    );
  };

  async loadData(instanceNode: NodeType) {
    const typeNode = await loadTypeNode(instanceNode);

    reloadAlerts();

    this.loadEnums();
    this.loadTypeProps(typeNode);
    this.loadInstanceData(instanceNode);
  }

  async loadEnums() {
    const json = await getJson('enums');
    const enums = ((json: any): EnumType[]);
    const enumMap = enums.reduce((map, anEnum) => {
      map[anEnum.id] = anEnum;
      return map;
    }, {});
    dispatchSet('enumMap', enumMap);
  }

  async loadInstanceData(instanceNode: NodeType) {
    let data = await getData(instanceNode);
    // Change the shape of this data
    // from an array of InstanceDataType objects
    // to an object with key/value pairs (map).
    data = data.reduce((map, d) => {
      map[d.dataKey] = d.dataValue;
      return map;
    }, {});
    dispatchSet('instanceData', data);
  }

  async loadTypeProps(typeNode: ?NodeType) {
    if (!typeNode) return;

    const json = await getJson(`types/${typeNode.id}/data`);
    const properties = ((json: any): PropertyType[]);
    const sortedProperties = sortBy(properties, ['name']);
    dispatchSet('ui.typeProps', sortedProperties);
  }

  renderProperties = () => {
    const {
      instanceData,
      ui: {typeProps}
    } = this.props;

    if (!typeProps || typeProps.length === 0) {
      return <div className="property-table">none</div>;
    }

    return (
      <table className="property-table">
        <tbody>
          {typeProps.map(typeProp =>
            this.renderProperty(typeProp, instanceData)
          )}
        </tbody>
      </table>
    );
  };

  renderProperty = (typeProp: PropertyType, instanceData: Object) => {
    const {kind, name} = typeProp;
    const value = instanceData[name];
    const setBoolean = () => {
      dispatchSet('isInChart', true);
    };
    return (
      <tr key={name}>
        <form>
          <input
            type="checkbox"
            name="propertyType"
            value={name}
            onClick={setBoolean}
          />
          <label htmlFor={name}>{name}</label>
        </form>
        {/* <td>{name}</td> */}
        <td className={kind}>{String(this.formatValue(kind, value))}</td>
      </tr>
    );
  };

  render() {
    const {chartData, isInChart} = this.props;
    // const {ambient, calibration, override, power} = this.isInChart;
    const ambientVal = chartData ? chartData.ambient : null;
    const calibration = chartData ? chartData.calibration : null;
    const now = moment().valueOf();
    const data = [];
    const millisecond = [];
    const calData = [];

    for (const key in calibration) {
      if (calibration.hasOwnProperty(key)) {
        calData.push(calibration[key]);
      }
    }

    for (const key in ambientVal) {
      if (ambientVal.hasOwnProperty(key)) {
        millisecond.push(key);
        data.push(ambientVal[key]);
      }
    }

    const ambientData = {};
    const calibrationData = {};

    for (let j = 0; j < data.length; j++) {
      this['data' + j] = data[j];
      // console.log(millisecond[j] + ' --> ' + data[j]);
      if (millisecond[j] === undefined) {
        millisecond[j] = moment().valueOf();
      }
      ambientData[moment(Number(millisecond[j])).format('h:mm:ss')] = data[j];
      calibrationData[
        moment(Number(millisecond[j])).format('h:mm:ss')
      ] = calData;
    }

    const ambientDisplay = {};
    if (isInChart === true) {
      ambientDisplay.name = 'Ambient';
      ambientDisplay.data = ambientData;
    } else {
      ambientDisplay.name = 'Ambient';
      ambientDisplay.data = '';
    }
    const node = this.getNode(this.props);
    if (!node) return null;

    const typeNode = getTypeNode(node);
    const typeName = typeNode.name;

    return (
      <section className="instance-detail">
        <header>
          <div className="title">
            {capitalize(typeName)} &quot;{node.name}&quot;
            {this.instanceButtons()}
          </div>
          {this.breadcrumbs(node)}
        </header>
        <section>
          <div className="heading">
            Properties
            <Button
              className="edit-properties"
              icon="cog"
              onClick={() => this.editProperties()}
              tooltip="edit properties"
              value="test"
            />
          </div>
          {this.renderProperties()}
        </section>
        <InstanceAlerts />
        <LineChart
          suffix="%"
          data={[ambientDisplay, {name: 'Calibration', data: calibrationData}]}
          height="300px"
          width="500px"
          xtitle="Property Values"
          dataset={{pointStyle: 'dash', pointRadius: 1}}
        />
        {/* <ColumnChart
          suffix="%"
          data={calibration}
          height="300px"
          width="500px"
          xtitle="Calibration"
          dataset={{pointStyle: 'dash', pointRadius: 1}}
        /> */}
      </section>
    );
  }
}

export default watch(InstanceDetail, {
  enumMap: '',
  instanceData: '',
  instanceNodeMap: '',
  ui: '',
  chartData: '',
  isInChart: ''
});
