/*
 *   Copyright OpenSearch Contributors
 *
 *   Licensed under the Apache License, Version 2.0 (the "License").
 *   You may not use this file except in compliance with the License.
 *   A copy of the License is located at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   or in the "license" file accompanying this file. This file is distributed
 *   on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *   express or implied. See the License for the specific language governing
 *   permissions and limitations under the License.
 */

import React, { useState, useEffect, useContext } from 'react';
import {
  EuiFlexGroup,
  EuiText,
  EuiPageHeader,
  EuiTitle,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiFlexItem,
  EuiSmallButton,
  EuiPageBody,
  EuiInMemoryTable,
  EuiBasicTableColumn,
  EuiSmallButtonEmpty,
  EuiSearchBarProps,
  Query,
  EuiLoadingContent,
} from '@elastic/eui';
import { difference } from 'lodash';
import { AppDependencies } from '../../types';
import {
  transformRoleData,
  requestDeleteRoles,
  RoleListing,
  fetchRole,
  fetchRoleMapping,
  buildSearchFilterOptions,
} from '../utils/role-list-utils';
import { Action } from '../types';
import { ResourceType } from '../../../../common';
import { buildHashUrl } from '../utils/url-builder';
import {
  ExternalLink,
  renderCustomization,
  truncatedListView,
  tableItemsUIProps,
} from '../utils/display-utils';
import { showTableStatusMessage } from '../utils/loading-spinner-utils';
import { useDeleteConfirmState } from '../utils/delete-confirm-modal-utils';
import { useContextMenuState } from '../utils/context-menu';
import { DocLinks } from '../constants';
import { DataSourceContext } from '../app-router';
import { SecurityPluginTopNavMenu } from '../top-nav-menu';
import { AccessErrorComponent } from '../access-error-component';
import { PageHeader } from '../header/header-components';
import { getDashboardsInfoSafe } from '../../../utils/dashboards-info-utils';

const getColumnList = (multitenancyEnabled: boolean): Array<EuiBasicTableColumn<RoleListing>> => {
  const columns: Array<EuiBasicTableColumn<RoleListing>> = [
    {
      field: 'roleName',
      name: 'Role',
      render: (text: string) => (
        <a href={buildHashUrl(ResourceType.roles, Action.view, text)}>{text}</a>
      ),
      sortable: true,
    },
    {
      field: 'clusterPermissions',
      name: 'Cluster permissions',
      render: truncatedListView(tableItemsUIProps),
      truncateText: true,
    },
    {
      field: 'indexPermissions',
      name: 'Index',
      render: truncatedListView(tableItemsUIProps),
      truncateText: true,
    },
    {
      field: 'internalUsers',
      name: 'Internal users',
      render: truncatedListView(tableItemsUIProps),
    },
    {
      field: 'backendRoles',
      name: 'Backend roles',
      render: truncatedListView(tableItemsUIProps),
    },
    ...(multitenancyEnabled
      ? [
          {
            field: 'tenantPermissions',
            name: 'Tenants',
            render: truncatedListView(tableItemsUIProps),
          },
        ]
      : []),
    {
      field: 'reserved',
      name: 'Customization',
      render: (reserved: boolean) => {
        return renderCustomization(reserved, tableItemsUIProps);
      },
    },
  ];
  return columns;
};

export function RoleList(props: AppDependencies) {
  const [roleData, setRoleData] = React.useState<RoleListing[]>([]);
  const [errorFlag, setErrorFlag] = React.useState(false);
  const [selection, setSelection] = React.useState<RoleListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [accessErrorFlag, setAccessErrorFlag] = React.useState(false);
  const { dataSource, setDataSource } = useContext(DataSourceContext)!;

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const rawRoleData = await fetchRole(props.coreStart.http, dataSource.id);
        const rawRoleMappingData = await fetchRoleMapping(props.coreStart.http, dataSource.id);
        const processedData = transformRoleData(rawRoleData, rawRoleMappingData);
        setRoleData(processedData);
        setErrorFlag(false);
        setAccessErrorFlag(false);
      } catch (e) {
        console.log(e);
        // requests with existing credentials but insufficient permissions result in 403, remote data-source requests with non-existing credentials result in 400
        if (e.response && [400, 403].includes(e.response.status)) {
          setAccessErrorFlag(true);
        }
        setErrorFlag(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [props.coreStart.http, dataSource]);

  const [isMultiTenancyEnabled, setIsMultiTenancyEnabled] = useState(true);
  React.useEffect(() => {
    const fetchIsMultiTenancyEnabled = async () => {
      try {
        const dashboardsInfo = await getDashboardsInfoSafe(props.coreStart.http);
        setIsMultiTenancyEnabled(
          Boolean(dashboardsInfo?.multitenancy_enabled && props.config.multitenancy.enabled)
        );
      } catch (e) {
        console.error(e);
      }
    };

    fetchIsMultiTenancyEnabled();
  }, [props.coreStart.http, props.config.multitenancy]);

  const handleDelete = async () => {
    const rolesToDelete: string[] = selection.map((r) => r.roleName);
    try {
      await requestDeleteRoles(props.coreStart.http, rolesToDelete, dataSource.id);
      // Refresh from server (calling fetchData) does not work here, the server still return the roles
      // that had been just deleted, probably because ES takes some time to sync to all nodes.
      // So here remove the selected roles from local memory directly.
      setRoleData(difference(roleData, selection));
      setSelection([]);
    } catch (e) {
      console.log(e);
    } finally {
      closeActionsMenu();
    }
  };

  const [showDeleteConfirmModal, deleteConfirmModal] = useDeleteConfirmState(
    handleDelete,
    'role(s)'
  );

  const actionsMenuItems = [
    <EuiSmallButtonEmpty
      data-test-subj="edit"
      key="edit"
      onClick={() => {
        window.location.href = buildHashUrl(ResourceType.roles, Action.edit, selection[0].roleName);
      }}
      disabled={selection.length !== 1 || selection[0].reserved}
    >
      Edit
    </EuiSmallButtonEmpty>,
    // TODO: Change duplication to a popup window
    <EuiSmallButtonEmpty
      data-test-subj="duplicate"
      key="duplicate"
      onClick={() => {
        window.location.href = buildHashUrl(
          ResourceType.roles,
          Action.duplicate,
          selection[0].roleName
        );
      }}
      disabled={selection.length !== 1}
    >
      Duplicate
    </EuiSmallButtonEmpty>,
    <EuiSmallButtonEmpty
      key="delete"
      color="danger"
      onClick={showDeleteConfirmModal}
      disabled={selection.length === 0 || selection.some((e) => e.reserved)}
    >
      Delete
    </EuiSmallButtonEmpty>,
  ];

  const [actionsMenu, closeActionsMenu] = useContextMenuState('Actions', {}, actionsMenuItems);

  const [searchOptions, setSearchOptions] = useState<EuiSearchBarProps>({});
  const [query, setQuery] = useState<Query | null>(null);

  useEffect(() => {
    setSearchOptions({
      onChange: (arg) => {
        setQuery(arg.query);
        return true;
      },
      filters: [
        {
          type: 'field_value_selection',
          field: 'clusterPermissions',
          name: 'Cluster permissions',
          multiSelect: 'or',
          options: buildSearchFilterOptions(roleData, 'clusterPermissions'),
        },
        {
          type: 'field_value_selection',
          field: 'indexPermissions',
          name: 'Index',
          multiSelect: 'or',
          options: buildSearchFilterOptions(roleData, 'indexPermissions'),
        },
        {
          type: 'field_value_selection',
          field: 'internalUsers',
          name: 'Internal users',
          multiSelect: 'or',
          options: buildSearchFilterOptions(roleData, 'internalUsers'),
        },
        {
          type: 'field_value_selection',
          field: 'backendRoles',
          name: 'Backend roles',
          multiSelect: 'or',
          options: buildSearchFilterOptions(roleData, 'backendRoles'),
        },
        ...(isMultiTenancyEnabled
          ? [
              {
                type: 'field_value_selection',
                field: 'tenantPermissions',
                name: 'Tenants',
                multiSelect: 'or',
                options: buildSearchFilterOptions(roleData, 'tenantPermissions'),
              },
            ]
          : []),
        {
          type: 'field_value_selection',
          field: 'reserved',
          name: 'Customization',
          multiSelect: false,
          options: [
            {
              value: true,
              view: renderCustomization(true, tableItemsUIProps),
            },
            {
              value: false,
              view: renderCustomization(false, tableItemsUIProps),
            },
          ],
        },
      ],
    });
  }, [roleData, isMultiTenancyEnabled]);

  const useUpdatedUX = props.coreStart.uiSettings.get('home:useNewHomePage');
  const buttonData = [
    {
      label: 'Create role',
      isLoading: false,
      href: buildHashUrl(ResourceType.roles, Action.create),
      fill: true,
      iconType: 'plus',
      iconSide: 'left',
      type: 'button',
      testId: 'create-role',
    },
  ];
  const descriptionData = [
    {
      isLoading: loading,
      renderComponent: (
        <EuiText size="xs" color="subdued">
          Roles are the core way of controlling access to your cluster. Roles contain any
          combination of cluster-wide permission, index-
          <br />
          specific permissions, document- and field-level security, and tenants. Then you map users
          to these roles so that users <br />
          gain those permissions. <ExternalLink href={DocLinks.UsersAndRolesDoc} />
        </EuiText>
      ),
    },
  ];

  const roleLen = Query.execute(query || '', roleData).length;

  return (
    <>
      <SecurityPluginTopNavMenu
        {...props}
        dataSourcePickerReadOnly={false}
        setDataSource={setDataSource}
        selectedDataSource={dataSource}
      />
      <PageHeader
        navigation={props.depsStart.navigation}
        coreStart={props.coreStart}
        descriptionControls={descriptionData}
        appRightControls={buttonData}
        fallBackComponent={
          <EuiPageHeader>
            <EuiText size="s">
              <h1>Roles</h1>
            </EuiText>
          </EuiPageHeader>
        }
        resourceType={ResourceType.roles}
        count={roleData.length}
      />
      {loading ? (
        <EuiLoadingContent />
      ) : accessErrorFlag ? (
        <AccessErrorComponent loading={loading} dataSourceLabel={dataSource && dataSource.label} />
      ) : (
        <EuiPageContent>
          {useUpdatedUX ? null : (
            <EuiPageContentHeader id="role-table-container">
              <EuiPageContentHeaderSection>
                <EuiTitle size="s">
                  <h3>
                    Roles
                    <span className="panel-header-count"> ({roleLen})</span>
                  </h3>
                </EuiTitle>
                <EuiText size="xs" color="subdued">
                  Roles are the core way of controlling access to your cluster. Roles contain any
                  combination of cluster-wide permission, index-specific permissions, document- and
                  field-level security, and tenants. Then you map users to these roles so that users
                  gain those permissions. <ExternalLink href={DocLinks.UsersAndRolesDoc} />
                </EuiText>
              </EuiPageContentHeaderSection>
              <EuiPageContentHeaderSection>
                <EuiFlexGroup>
                  <EuiFlexItem>{actionsMenu}</EuiFlexItem>
                  <EuiFlexItem>
                    <EuiSmallButton
                      fill
                      href={buildHashUrl(ResourceType.roles, Action.create)}
                      data-test-subj="create-role"
                    >
                      Create role
                    </EuiSmallButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageContentHeaderSection>
            </EuiPageContentHeader>
          )}
          <EuiPageBody>
            <EuiInMemoryTable
              data-test-subj="role-list"
              tableLayout={'auto'}
              loading={roleData === [] && !errorFlag}
              columns={getColumnList(isMultiTenancyEnabled)}
              items={roleData}
              itemId={'roleName'}
              pagination={true}
              selection={{ onSelectionChange: setSelection }}
              sorting={true}
              search={{
                ...searchOptions,
                toolsRight: useUpdatedUX ? [<EuiFlexItem>{actionsMenu}</EuiFlexItem>] : undefined,
              }}
              error={errorFlag ? 'Load data failed, please check console log for more detail.' : ''}
              message={showTableStatusMessage(loading, roleData)}
            />
          </EuiPageBody>
          {deleteConfirmModal}
        </EuiPageContent>
      )}
    </>
  );
}
