<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import { fetchBills, batchImportBills, updateBill, type BillUpdateParams } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { executeSync } from '@/utils/sync-feedback';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsListPage' });

const billsStore = useBillsStore();
// 代码远程搜索（NAutoComplete，防抖 300ms）
const { symbolOptions: rawSymbolOptions, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

// NAutoComplete 选中后 v-model = option.label，所以 label 必须设为纯 symbol
// display 字段保留下拉列表的富文本（symbol name (industry)），通过 renderLabel 渲染
const symbolOptions = computed(() =>
  rawSymbolOptions.value.map(o => ({ label: o.value, value: o.value, display: o.label }))
);

// 自定义下拉项渲染：显示 "symbol name (industry)"，但选中后 v-model 只拿到纯 symbol
function renderSymbolLabel(option: any) {
  return option.display || option.label;
}

const loading = ref(false);
// 导入专用 loading：与表格 loading 分离，避免导入过程中表格闪烁
const importLoading = ref(false);
const tableData = ref<Api.Bills.Bill[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 筛选参数：account/category 单选精确匹配，symbol NAutoComplete 支持直接输入提交
const searchParams = reactive<{ account?: string | null; category?: string | null; symbol?: string }>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchBills({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      account: searchParams.account || undefined,
      category: searchParams.category || undefined,
      // NAutoComplete 清空返回空串，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
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
  searchParams.account = null;
  searchParams.category = null;
  searchParams.symbol = '';
  clearSymbolOptions();
  fetchData();
}

// 触发后端账单批量导入（executeSync 内置进度条/防重复/结果通知）
async function handleImport() {
  await executeSync(batchImportBills, importLoading, fetchData);
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

// ===== 编辑弹窗 =====

const editingId = ref<number | null>(null);
const showModal = ref(false);
const submitLoading = ref(false);
const formRef = ref();

// 分组展开状态：默认只展开成交数据组
const expandedNames = ref<string[]>(['deal']);

// NInputNumber precision 映射
const PRECISION = {
  price: 4,
  amount: 2,
  fee_tax: 2,
  fees: 2,
  taxes: 2,
  fee_exec1: 2,
  fee_exec2: 2,
  fee_exec3: 2,
  fee_hand: 2,
  fee_sr: 2,
  fee_clear: 2,
  fee_reg: 2,
  fee_other: 2,
  premium: 2,
  cash: 2,
  vol: 0,
  balance: 0
};

// 编辑表单数据（全可选，null 表示不修改）
const formData = reactive<{
  trade_time: string | null;
  symbol: string;
  name: string;
  exec_type: string;
  category1: string;
  category: string;
  b_s: string | null;
  c_p: string | null;
  o_c: string | null;
  price: number | null;
  vol: number | null;
  amount: number | null;
  amount_act: number | null;
  balance: number | null;
  fee_tax: number | null;
  fees: number | null;
  taxes: number | null;
  fee_exec1: number | null;
  fee_exec2: number | null;
  fee_exec3: number | null;
  fee_hand: number | null;
  fee_sr: number | null;
  fee_clear: number | null;
  fee_reg: number | null;
  fee_other: number | null;
  premium: number | null;
  cash: number | null;
  id_exec: string | null;
  id_agree: string | null;
  currency: string;
  account_id: string | null;
  market: string | null;
  account: string;
}>({
  trade_time: null,
  symbol: '',
  name: '',
  exec_type: '',
  category1: '',
  category: '',
  b_s: null,
  c_p: null,
  o_c: null,
  price: null,
  vol: null,
  amount: null,
  amount_act: null,
  balance: null,
  fee_tax: null,
  fees: null,
  taxes: null,
  fee_exec1: null,
  fee_exec2: null,
  fee_exec3: null,
  fee_hand: null,
  fee_sr: null,
  fee_clear: null,
  fee_reg: null,
  fee_other: null,
  premium: null,
  cash: null,
  id_exec: null,
  id_agree: null,
  currency: '',
  account_id: null,
  market: null,
  account: ''
});

function resetForm() {
  Object.keys(formData).forEach(k => {
    const key = k as keyof typeof formData;
    formData[key] = (PRECISION[key as keyof typeof PRECISION] !== undefined ? null : '') as never;
  });
  formData.b_s = null;
  formData.c_p = null;
  formData.o_c = null;
  formData.balance = null;
  formData.fee_tax = null;
  formData.fees = null;
  formData.taxes = null;
  formData.fee_exec1 = null;
  formData.fee_exec2 = null;
  formData.fee_exec3 = null;
  formData.fee_hand = null;
  formData.fee_sr = null;
  formData.fee_clear = null;
  formData.fee_reg = null;
  formData.fee_other = null;
  formData.premium = null;
  formData.cash = null;
  formData.id_exec = null;
  formData.id_agree = null;
  formData.account_id = null;
  formData.market = null;
  formData.trade_time = null;
  expandedNames.value = ['deal'];
  formRef.value?.restoreValidation();
}

// Decimal 字符串安全转 number
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// 打开编辑弹窗：回填行数据
function handleEdit(row: Api.Bills.Bill) {
  resetForm();
  editingId.value = row.id;
  // trade_time 格式：去掉 'T' 换成空格，截取到秒
  formData.trade_time = row.trade_time ? row.trade_time.replace('T', ' ').slice(0, 19) : null;
  formData.symbol = row.symbol ?? '';
  formData.name = row.name ?? '';
  formData.exec_type = row.exec_type ?? '';
  formData.category1 = row.category1 ?? '';
  formData.category = row.category ?? '';
  formData.b_s = row.b_s ?? null;
  formData.c_p = row.c_p ?? null;
  formData.o_c = row.o_c ?? null;
  formData.price = toNum(row.price);
  formData.vol = toNum(row.vol);
  formData.amount = toNum(row.amount);
  formData.amount_act = toNum(row.amount_act);
  formData.balance = toNum(row.balance);
  formData.fee_tax = toNum(row.fee_tax);
  formData.fees = toNum(row.fees);
  formData.taxes = toNum(row.taxes);
  formData.fee_exec1 = toNum(row.fee_exec1);
  formData.fee_exec2 = toNum(row.fee_exec2);
  formData.fee_exec3 = toNum(row.fee_exec3);
  formData.fee_hand = toNum(row.fee_hand);
  formData.fee_sr = toNum(row.fee_sr);
  formData.fee_clear = toNum(row.fee_clear);
  formData.fee_reg = toNum(row.fee_reg);
  formData.fee_other = toNum(row.fee_other);
  formData.premium = toNum(row.premium);
  formData.cash = toNum(row.cash);
  formData.id_exec = row.id_exec ?? null;
  formData.id_agree = row.id_agree ?? null;
  formData.currency = row.currency ?? '';
  formData.account_id = row.account_id ?? null;
  formData.market = row.market ?? null;
  formData.account = row.account ?? '';
  showModal.value = true;
}

// 提交编辑
async function handleSubmit() {
  if (editingId.value === null) return;
  submitLoading.value = true;
  try {
    // 构造 payload：只传非空值（后端 None 表示不修改）
    const payload: BillUpdateParams = {};
    (Object.keys(formData) as Array<keyof typeof formData>).forEach(key => {
      const val = formData[key];
      if (val === null || val === '') return;
      if (val === undefined) return;
      (payload as any)[key] = val;
    });
    const { error } = await updateBill(editingId.value, payload);
    if (!error) {
      window.$message?.success('修改成功');
      showModal.value = false;
      resetForm();
      fetchData();
    }
  } finally {
    submitLoading.value = false;
  }
}

function handleCancel() {
  showModal.value = false;
  resetForm();
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Bill, key: string) {
  const val = (row as any)[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

const columns = [
  // 交易时间截取前 19 位（去掉毫秒/时区部分），点击编辑
  {
    title: '交易时间',
    key: 'trade_time',
    width: 160,
    render: (row: Api.Bills.Bill) =>
      h(
        NButton,
        { text: true, type: 'primary', onClick: () => handleEdit(row) },
        { default: () => row.trade_time?.slice(0, 19).replace('T', ' ') ?? '-' }
      )
  },
  { title: '代码', key: 'symbol', width: 150 },
  { title: '名称', key: 'name', width: 160 },
  { title: '总分类', key: 'category', width: 80 },
  { title: '一级分类', key: 'category1', width: 80 },
  { title: '买/卖', key: 'b_s', width: 60 },
  { title: '沽/购', key: 'c_p', width: 60 },
  { title: '开/平', key: 'o_c', width: 60 },
  { title: '成交价', key: 'price', width: 100, render: (row: Api.Bills.Bill) => Number(row.price).toFixed(4) },
  { title: '成交量', key: 'vol', width: 60 },
  { title: '成交额', key: 'amount', width: 120, render: (row: Api.Bills.Bill) => Number(row.amount).toFixed(2) },
  {
    title: '发生额',
    key: 'amount_act',
    width: 120,
    render: (row: Api.Bills.Bill) => Number(row.amount_act).toFixed(2)
  },
  { title: '税费合计', key: 'fee_tax', width: 80, render: (row: Api.Bills.Bill) => renderAmount(row, 'fee_tax') },
  { title: '账户', key: 'account', width: 60 }
];

onMounted(() => {
  fetchData();
  // 确保类别/账户列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
  billsStore.loadAccounts();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="账户">
          <NSelect
            v-model:value="searchParams.account"
            :options="accountOptions"
            clearable
            placeholder="单选精确匹配"
            style="width: 110px"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            clearable
            placeholder="单选精确匹配"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="代码">
          <NAutoComplete
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :render-label="renderSymbolLabel"
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 200px"
            @update:value="handleSymbolSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton type="info" :loading="importLoading" @click="handleImport">导入</NButton>
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

    <!-- ===== 编辑弹窗 ===== -->
    <NModal v-model:show="showModal" preset="card" title="编辑账单" class="w-720px" :mask-closable="false">
      <NForm ref="formRef" :model="formData" label-placement="left" label-width="100px">
        <!-- 基本信息 -->
        <NCollapse v-model:expanded-names="expandedNames" class="mt-8px">
          <NCollapseItem title="基本信息" name="basic">
            <NFormItem label="交易时间">
              <NDatePicker
                v-model:formatted-value="formData.trade_time"
                type="datetime"
                value-format="yyyy-MM-dd HH:mm:ss"
                class="w-full"
              />
            </NFormItem>
            <NFormItem label="代码">
              <NInput v-model:value="formData.symbol" />
            </NFormItem>
            <NFormItem label="名称">
              <NInput v-model:value="formData.name" />
            </NFormItem>
            <NFormItem label="操作类型">
              <NInput v-model:value="formData.exec_type" />
            </NFormItem>
            <NFormItem label="一级分类">
              <NInput v-model:value="formData.category1" />
            </NFormItem>
            <NFormItem label="总分类">
              <NInput v-model:value="formData.category" />
            </NFormItem>
            <NFormItem label="买/卖">
              <NInput v-model:value="formData.b_s" />
            </NFormItem>
            <NFormItem label="沽/购">
              <NInput v-model:value="formData.c_p" />
            </NFormItem>
            <NFormItem label="开/平">
              <NInput v-model:value="formData.o_c" />
            </NFormItem>
          </NCollapseItem>

          <!-- 成交数据（默认展开） -->
          <NCollapseItem title="成交数据" name="deal">
            <NFormItem label="成交价">
              <NInputNumber v-model:value="formData.price" :precision="4" :step="0.0001" class="w-full" />
            </NFormItem>
            <NFormItem label="成交量">
              <NInputNumber v-model:value="formData.vol" :precision="0" :step="1" class="w-full" />
            </NFormItem>
            <NFormItem label="成交额">
              <NInputNumber v-model:value="formData.amount" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="发生额">
              <NInputNumber v-model:value="formData.amount_act" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="余额">
              <NInputNumber v-model:value="formData.balance" :precision="0" :step="1" class="w-full" />
            </NFormItem>
          </NCollapseItem>

          <!-- 费用明细 -->
          <NCollapseItem title="费用明细" name="fee">
            <NFormItem label="税费合计">
              <NInputNumber v-model:value="formData.fee_tax" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="手续费">
              <NInputNumber v-model:value="formData.fees" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="印花税">
              <NInputNumber v-model:value="formData.taxes" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="过户费">
              <NInputNumber v-model:value="formData.fee_exec1" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="交易过户费">
              <NInputNumber v-model:value="formData.fee_exec2" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="行权过户费">
              <NInputNumber v-model:value="formData.fee_exec3" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="经手费">
              <NInputNumber v-model:value="formData.fee_hand" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="证管费">
              <NInputNumber v-model:value="formData.fee_sr" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="清算费">
              <NInputNumber v-model:value="formData.fee_clear" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="交易规费">
              <NInputNumber v-model:value="formData.fee_reg" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="其他费用">
              <NInputNumber v-model:value="formData.fee_other" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="权利金收支">
              <NInputNumber v-model:value="formData.premium" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="资金余额">
              <NInputNumber v-model:value="formData.cash" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
          </NCollapseItem>

          <!-- 编号与账户信息 -->
          <NCollapseItem title="编号与账户信息" name="account">
            <NFormItem label="成交编号">
              <NInput v-model:value="formData.id_exec" />
            </NFormItem>
            <NFormItem label="流水号">
              <NInput v-model:value="formData.id_agree" />
            </NFormItem>
            <NFormItem label="币种">
              <NInput v-model:value="formData.currency" />
            </NFormItem>
            <NFormItem label="账号">
              <NInput v-model:value="formData.account_id" />
            </NFormItem>
            <NFormItem label="市场">
              <NInput v-model:value="formData.market" />
            </NFormItem>
            <NFormItem label="账户">
              <NInput v-model:value="formData.account" />
            </NFormItem>
          </NCollapseItem>
        </NCollapse>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleCancel">取消</NButton>
          <NButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
