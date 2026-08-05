<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import { fetchValueMonitors, createValueMonitor, updateValueMonitor, deleteValueMonitor } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IrsValueMonitorsPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.ValueMonitor[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

const searchParams = reactive({
  symbol: '' as string,
  name: '' as string
});

// 拉取估值监测列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchValueMonitors({
      symbol: searchParams.symbol || undefined,
      name: searchParams.name || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      pagination.itemCount = data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.symbol = '';
  searchParams.name = '';
  pagination.page = 1;
  fetchData();
}

// ===== 新增模态框 =====
const editingId = ref<number | null>(null);
const showModal = ref(false);
const submitLoading = ref(false);
const formRef = ref();
const formData = reactive({
  symbol: '',
  name: '',
  pp_el: null as number | null,
  pp_l: null as number | null,
  pp_m: null as number | null,
  pp_h: null as number | null,
  pp_eh: null as number | null
});

// 模态框标题：新增/编辑动态切换
const modalTitle = computed(() => (editingId.value === null ? '新增估值监测' : '编辑估值监测'));

// 表单校验规则：所有字段必填
const formRules = {
  symbol: { required: true, message: '请输入代码', trigger: 'blur' },
  name: { required: true, message: '请输入名称', trigger: 'blur' },
  pp_el: { required: true, type: 'number' as const, message: '请输入极低', trigger: 'blur' },
  pp_l: { required: true, type: 'number' as const, message: '请输入低', trigger: 'blur' },
  pp_m: { required: true, type: 'number' as const, message: '请输入中', trigger: 'blur' },
  pp_h: { required: true, type: 'number' as const, message: '请输入高', trigger: 'blur' },
  pp_eh: { required: true, type: 'number' as const, message: '请输入极高', trigger: 'blur' }
};

// 打开新增模态框
function handleAdd() {
  resetForm();
  editingId.value = null;
  showModal.value = true;
}

// 打开编辑模态框：回填行数据
// 注意：后端 Decimal 字段经 JSON 序列化可能为字符串，需 Number() 转换为数字
function handleEdit(row: Api.Irs.ValueMonitor) {
  resetForm();
  editingId.value = row.id;
  formData.symbol = row.symbol;
  formData.name = row.name ?? '';
  formData.pp_el = row.pp_el != null ? Number(row.pp_el) : null;
  formData.pp_l = row.pp_l != null ? Number(row.pp_l) : null;
  formData.pp_m = row.pp_m != null ? Number(row.pp_m) : null;
  formData.pp_h = row.pp_h != null ? Number(row.pp_h) : null;
  formData.pp_eh = row.pp_eh != null ? Number(row.pp_eh) : null;
  showModal.value = true;
}

// 重置表单
function resetForm() {
  editingId.value = null;
  formData.symbol = '';
  formData.name = '';
  formData.pp_el = null;
  formData.pp_l = null;
  formData.pp_m = null;
  formData.pp_h = null;
  formData.pp_eh = null;
  formRef.value?.restoreValidation();
}

// 提交新增/修改
async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  submitLoading.value = true;
  try {
    const params = {
      name: formData.name,
      pp_el: formData.pp_el!,
      pp_l: formData.pp_l!,
      pp_m: formData.pp_m!,
      pp_h: formData.pp_h!,
      pp_eh: formData.pp_eh!
    };
    let error;
    if (editingId.value === null) {
      // 新增：需带 symbol
      ({ error } = await createValueMonitor({
        symbol: formData.symbol,
        ...params
      }));
    } else {
      // 修改：PUT by id
      ({ error } = await updateValueMonitor(editingId.value, params));
    }
    if (!error) {
      window.$message?.success(editingId.value === null ? '新增成功' : '修改成功');
      showModal.value = false;
      resetForm();
      pagination.page = 1;
      fetchData();
    }
  } finally {
    submitLoading.value = false;
  }
}

// 取消新增/编辑
function handleCancel() {
  showModal.value = false;
  resetForm();
}

// 删除当前编辑记录
async function handleDelete() {
  if (editingId.value === null) return;
  submitLoading.value = true;
  try {
    const { error } = await deleteValueMonitor(editingId.value);
    if (!error) {
      window.$message?.success('删除成功');
      showModal.value = false;
      resetForm();
      pagination.page = 1;
      fetchData();
    }
  } finally {
    submitLoading.value = false;
  }
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// 估值价字段保留四位小数（Numeric(12,4)），空值显示 '-'
const fmt4 = (v: number | null) => (v != null ? Number(v).toFixed(4) : '-');
// 百分比字段保留两位小数（Numeric(9,2)），空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  {
    title: '名称',
    key: 'name',
    width: 100,
    fixed: 'left',
    render: (row: Api.Irs.ValueMonitor) =>
      h(NButton, { text: true, type: 'primary', onClick: () => handleEdit(row) }, { default: () => row.name })
  },
  // 估值区间
  { title: '极低', key: 'pp_el', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_el) },
  { title: '低', key: 'pp_l', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_l) },
  { title: '中', key: 'pp_m', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_m) },
  { title: '高', key: 'pp_h', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_h) },
  { title: '极高', key: 'pp_eh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_eh) },
  // 行情字段
  { title: '上年末', key: 'py_close', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.py_close) },
  { title: '年高', key: 'y_high', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.y_high) },
  { title: '年低', key: 'y_low', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.y_low) },
  { title: '最新价', key: 'price', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.price) },
  // 行情监测字段
  { title: '年高(%)', key: 'pv_yh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yh) },
  { title: '年低(%)', key: 'pv_yl', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yl) },
  { title: '最新(%)', key: 'pv_yy', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yy) },
  // 估值监测字段
  { title: '极低(%)', key: 'pv_el', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_el) },
  { title: '低(%)', key: 'pv_l', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_l) },
  { title: '中(%)', key: 'pv_m', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_m) },
  { title: '高(%)', key: 'pv_h', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_h) },
  { title: '极高(%)', key: 'pv_eh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_eh) },
  // 估值监测年化字段
  { title: '极低(y%)', key: 'pv_el_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_el_y) },
  { title: '低(y%)', key: 'pv_l_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_l_y) },
  { title: '中(y%)', key: 'pv_m_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_m_y) },
  { title: '高(y%)', key: 'pv_h_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_h_y) },
  { title: '极高(y%)', key: 'pv_eh_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_eh_y) }
];

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NInput
            v-model:value="searchParams.symbol"
            clearable
            placeholder="请输入代码"
            style="width: 160px"
          />
        </NFormItem>
        <NFormItem label="名称">
          <NInput
            v-model:value="searchParams.name"
            clearable
            placeholder="请输入名称"
            style="width: 160px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem>
          <NButton type="primary" @click="handleAdd">
            <template #icon><SvgIcon icon="mdi:plus" /></template>
            新增
          </NButton>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalTitle"
      class="w-480px"
      :mask-closable="false"
    >
      <NForm
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="left"
        label-width="80px"
      >
        <NFormItem label="代码" path="symbol">
          <NInput v-model:value="formData.symbol" :disabled="editingId !== null" placeholder="请输入代码" />
        </NFormItem>
        <NFormItem label="名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入名称" />
        </NFormItem>
        <NFormItem label="极低" path="pp_el">
          <NInputNumber
            v-model:value="formData.pp_el"
            :precision="4"
            :step="0.0001"
            placeholder="请输入极低"
            class="w-full"
          />
        </NFormItem>
        <NFormItem label="低" path="pp_l">
          <NInputNumber
            v-model:value="formData.pp_l"
            :precision="4"
            :step="0.0001"
            placeholder="请输入低"
            class="w-full"
          />
        </NFormItem>
        <NFormItem label="中" path="pp_m">
          <NInputNumber
            v-model:value="formData.pp_m"
            :precision="4"
            :step="0.0001"
            placeholder="请输入中"
            class="w-full"
          />
        </NFormItem>
        <NFormItem label="高" path="pp_h">
          <NInputNumber
            v-model:value="formData.pp_h"
            :precision="4"
            :step="0.0001"
            placeholder="请输入高"
            class="w-full"
          />
        </NFormItem>
        <NFormItem label="极高" path="pp_eh">
          <NInputNumber
            v-model:value="formData.pp_eh"
            :precision="4"
            :step="0.0001"
            placeholder="请输入极高"
            class="w-full"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleCancel">取消</NButton>
          <NButton type="primary" :loading="submitLoading" @click="handleSubmit">
            {{ editingId === null ? '确定' : '修改' }}
          </NButton>
          <NButton v-if="editingId !== null" type="error" :loading="submitLoading" @click="handleDelete">删除</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
